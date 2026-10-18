"""MT5 dry-run service. This release deliberately has NO broker order-send path.
Reads only an already signed-in terminal. Credentials are never requested/stored.
"""
from dataclasses import asdict
from datetime import datetime, timezone
import json
import math
import sqlite3
import threading
import time
from .core import Config, Bar, analyze, demo_identity, lot_for_risk

class Runtime:
    def __init__(self, mt5, login, server, symbol='XAUUSD', db='gold-journal.sqlite3', config=None):
        self.mt5,self.login,self.server,self.symbol=mt5,login,server,symbol
        self.config=config or Config()
        self.config.validate()
        self.lock=threading.RLock()
        self.stopped=threading.Event()
        self.stopped.set()  # every process start is safe
        self.lease=0.0
        self.last_bar=None
        self.db=sqlite3.connect(db,check_same_thread=False)
        self.db.execute('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, utc REAL, kind TEXT, payload TEXT)')
        self.state={'mode':'STOPPED','execution_enabled':False,'demo_verified':False,
                    'price':None,'signal':'WAIT','positions':[],'orders':[],
                    'pnl':None,'reason':'No verified MT5 connection','metrics':{},'timestamp_ms':0}
        self.log('START',{'execution':'LOCKED','reason':'device qualification and user approval pending'})

    def log(self,kind,payload):
        with self.lock:
            self.db.execute('INSERT INTO events(utc,kind,payload) VALUES(?,?,?)',
                            (time.time(),kind,json.dumps(payload,allow_nan=False)))
            self.db.commit()

    def stop(self):
        self.stopped.set()  # before acquiring lock: no queued new cycle can proceed
        self.lease=0.0
        with self.lock:
            self.state.update(mode='STOPPED',reason='STOP: new decisions disabled; no broker orders sent by this release')
            self.log('STOP',{})
        return self.status()

    def start_simulation(self):
        with self.lock:
            # start never authorizes real/Demo broker execution
            if (not self.state['demo_verified'] or self.state['mode']=='FAULT' or
                    not 0 <= time.time()*1000-self.state['timestamp_ms'] <= 5000):
                raise ValueError('verified Demo and healthy snapshot required')
            self.lease=time.monotonic()+10
            self.stopped.clear()
            self.state['mode']='DRY_RUN'
            self.log('DRY_RUN_START',{})
        return self.status()

    def heartbeat(self):
        if not self.stopped.is_set():
            self.lease=time.monotonic()+10

    def update_config(self,values):
        self.stop()
        allowed=set(asdict(Config()))
        if set(values)-allowed:
            raise ValueError('unknown settings')
        c=Config(**values)
        c.validate()
        with self.lock:
            self.config=c
            self.log('CONFIG',asdict(c))
        return self.status()

    def status(self):
        with self.lock:
            state=json.loads(json.dumps(self.state,allow_nan=False))
            state['config']=asdict(self.config)
            state['events']=[{'utc':r[0],'kind':r[1],'payload':json.loads(r[2])} for r in
                self.db.execute('SELECT utc,kind,payload FROM events ORDER BY id DESC LIMIT 40')]
            state['execution_enabled']=False
            state['mode']='STOPPED' if self.stopped.is_set() and state['mode']=='DRY_RUN' else state['mode']
            return state

    def fault(self,reason):
        self.stopped.set()
        with self.lock:
            self.state.update(mode='FAULT',demo_verified=False,signal='WAIT',price=None,pnl=None,
                              positions=[],orders=[],plan=None,indicators=None,account=None,reason=reason,timestamp_ms=int(time.time()*1000))
            self.log('FAULT',{'reason':reason})

    def poll(self):
        start=time.perf_counter()
        try:
            self._poll()
        except Exception as exc:
            self.fault(type(exc).__name__+': '+str(exc))
        with self.lock:
            self.state['metrics']['poll_ms']=(time.perf_counter()-start)*1000
        return self.status()

    def _poll(self):
        m=self.mt5
        terminal=m.terminal_info()
        if not terminal or not terminal.connected:
            raise ValueError('MT5 disconnected')
        account=m.account_info()
        if not demo_identity(account,self.login,self.server):
            raise ValueError('Account identity / Demo enum / USD / FxPro company mismatch')
        if not m.symbol_select(self.symbol,True):
            raise ValueError('Configured broker symbol unavailable')
        spec,tick=m.symbol_info(self.symbol),m.symbol_info_tick(self.symbol)
        if not spec or not tick:
            raise ValueError('Missing broker specification or tick')
        if spec.currency_base != 'XAU' or spec.currency_profit != 'USD':
            raise ValueError('Configured symbol is not verified XAU/USD')
        now=time.time()
        age=now*1000-tick.time_msc
        c=self.config
        if not (0<=age<=c.max_tick_age_ms):
            raise ValueError('Stale/future tick')
        if not (math.isfinite(tick.ask) and math.isfinite(tick.bid) and 0<tick.bid<=tick.ask):
            raise ValueError('Invalid quote')
        positions,orders=m.positions_get(),m.orders_get()
        if positions is None or orders is None:
            raise ValueError('Unknown broker order state')
        # Broker server defines daily boundary; use UTC explicitly for this release.
        midnight=datetime.fromtimestamp(now,timezone.utc).replace(hour=0,minute=0,second=0,microsecond=0)
        deals=m.history_deals_get(midnight,datetime.fromtimestamp(now,timezone.utc))
        if deals is None:
            raise ValueError('Unknown daily P/L')
        # Gross realized trading losses + all costs, no offset by winning trades.
        gross_loss=sum(max(0,-d.profit)+max(0,-d.commission)+max(0,-d.swap)+max(0,-d.fee)
                       for d in deals if d.type in (m.DEAL_TYPE_BUY,m.DEAL_TYPE_SELL))
        pnl=sum(d.profit+d.commission+d.swap+d.fee for d in deals
                if d.type in (m.DEAL_TYPE_BUY,m.DEAL_TYPE_SELL))
        if not math.isfinite(pnl) or not math.isfinite(gross_loss):
            raise ValueError('Invalid daily P/L')
        raw1=m.copy_rates_from_pos(self.symbol,m.TIMEFRAME_M1,1,220)
        raw5=m.copy_rates_from_pos(self.symbol,m.TIMEFRAME_M5,1,220)
        if raw1 is None or raw5 is None:
            raise ValueError('Missing candle data')
        convert=lambda rows:[Bar(int(r['time']),float(r['open']),float(r['high']),float(r['low']),float(r['close'])) for r in rows]
        t=time.perf_counter()
        decision=analyze(convert(raw1),convert(raw5),c,now)
        decision_ms=(time.perf_counter()-t)*1000
        # Verify account again after the data calls; a user may switch accounts in MT5.
        if not demo_identity(m.account_info(),self.login,self.server):
            raise ValueError('Account changed while reading')
        reason='Broker execution locked pending qualification and explicit approval'
        plan=None
        if tick.ask-tick.bid>c.max_spread:
            reason='Spread above limit'
        elif positions or orders:
            reason='Existing position or pending order: no new entry'
        elif gross_loss + max(0,-account.profit)>=c.daily_loss_usd:
            self.stopped.set()
            reason='Daily loss limit reached (gross losses plus floating loss)'
        elif not c.costs_confirmed:
            reason='Broker commission/slippage assumptions must be confirmed'
        elif decision['signal']!='WAIT':
            buy=decision['signal']=='BUY'
            price=tick.ask if buy else tick.bid
            distance=max(decision['atr']*c.stop_atr,spec.trade_stops_level*spec.point+tick.ask-tick.bid)
            if not math.isfinite(distance) or distance<=0 or spec.trade_tick_size<=0:
                raise ValueError('Invalid stop distance / tick size')
            from decimal import Decimal, ROUND_FLOOR, ROUND_CEILING
            D=lambda v:Decimal(str(v))
            quant=lambda v,up:float((D(v)/D(spec.trade_tick_size)).to_integral_value(
                rounding=ROUND_CEILING if up else ROUND_FLOOR)*D(spec.trade_tick_size))
            sl=quant(price-distance if buy else price+distance,not buy)
            tp=quant(price+distance*c.reward_risk if buy else price-distance*c.reward_risk,buy)
            if sl<=0 or tp<=0:
                raise ValueError('Invalid protective prices')
            action=m.ORDER_TYPE_BUY if buy else m.ORDER_TYPE_SELL
            loss=m.order_calc_profit(action,self.symbol,1.0,price+c.slippage if buy else price-c.slippage,sl)
            if loss is None or not math.isfinite(loss) or loss>=0:
                raise ValueError('Cannot calculate broker stop loss')
            remaining=c.daily_loss_usd-gross_loss-max(0,-account.profit)
            lots=lot_for_risk(min(c.risk_usd,remaining),-loss,spec.volume_min,spec.volume_max,spec.volume_step,c.commission_per_lot)
            if lots is None:
                reason='Minimum lot exceeds risk budget'
            else:
                margin=m.order_calc_margin(action,self.symbol,lots,price)
                if margin is None or not math.isfinite(margin) or margin<0 or margin>account.margin_free:
                    raise ValueError('Insufficient/unknown margin')
                plan=dict(side=decision['signal'],volume=lots,entry=price,sl=sl,tp=tp,
                          estimated_stop_risk=lots*(-loss+c.commission_per_lot),bar_time=decision['bar_time'])
                reason='DRY RUN candidate only; broker execution locked'
        if not self.stopped.is_set() and time.monotonic()>self.lease:
            self.stopped.set()
            reason='Controller heartbeat expired; stopped safely'
        with self.lock:
            mode='STOPPED' if self.stopped.is_set() else 'DRY_RUN'
            self.state.update(mode=mode,demo_verified=True,account={'login':account.login,'server':account.server,
                'company':account.company,'currency':account.currency,'trade_mode':account.trade_mode},price={'bid':tick.bid,'ask':tick.ask},
                signal=decision['signal'],indicators=decision,pnl=pnl,daily_gross_loss=gross_loss,
                positions=[p._asdict() for p in positions],orders=[o._asdict() for o in orders],
                reason=reason,plan=plan,timestamp_ms=int(time.time()*1000),
                metrics={'tick_age_ms':age,'decision_ms':decision_ms,'execution_confirmation_ms':None})
            if mode=='DRY_RUN' and plan and self.last_bar!=plan['bar_time'] and not self.stopped.is_set():
                self.last_bar=plan['bar_time']
                self.log('DRY_RUN_CANDIDATE',plan)
            self.log('DECISION',{'signal':decision['signal'],'reason':reason,'mode':mode})
