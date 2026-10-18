import unittest
import tempfile
import time
from dataclasses import replace
from types import SimpleNamespace as NS
from collections import namedtuple
from engine.core import Config,Bar,ema,rsi,atr,analyze,lot_for_risk,demo_identity
from engine.runtime import Runtime

NOW=1800000000

def bars(n,seconds,delta=0.2):
    last=NOW//seconds*seconds-seconds
    return [Bar(last-(n-1-i)*seconds,100+i*delta,101+i*delta,99+i*delta,100+i*delta) for i in range(n)]

class FakeMT5:
    TIMEFRAME_M1=1; TIMEFRAME_M5=5; ORDER_TYPE_BUY=0; ORDER_TYPE_SELL=1
    DEAL_TYPE_BUY=0; DEAL_TYPE_SELL=1
    def __init__(self):
        self.account=NS(login=123,server='FxPro-test',trade_mode=0,currency='USD',company='FxPro',profit=0,margin_free=100)
        self.connected=True; self.age=0; self.pending=(); self.pos=(); self.deals=()
        self.spread=.2; self.minimum=.01; self.switched=False; self.calls=0
    def terminal_info(self): return NS(connected=self.connected)
    def account_info(self):
        self.calls+=1
        if self.switched and self.calls%2==0: return NS(**{**vars(self.account),'trade_mode':2})
        return self.account
    def symbol_select(self,*a): return True
    def symbol_info(self,*a): return NS(currency_base='XAU',currency_profit='USD',trade_stops_level=1,point=.01,trade_tick_size=.01,volume_min=self.minimum,volume_max=10,volume_step=.01)
    def symbol_info_tick(self,*a): return NS(bid=100,ask=100+self.spread,time_msc=time.time()*1000-self.age)
    def positions_get(self): return self.pos
    def orders_get(self): return self.pending
    def history_deals_get(self,*a): return self.deals
    def copy_rates_from_pos(self,symbol,frame,*a):
        seconds=60 if frame==1 else 300
        now=int(time.time())//seconds*seconds-seconds
        return [dict(time=now-(219-i)*seconds,open=100+i*.2,high=101+i*.2,low=99+i*.2,close=100+i*.2) for i in range(220)]
    def order_calc_profit(self,side,symbol,volume,entry,stop): return -abs(entry-stop)*100
    def order_calc_margin(self,*a): return 1

class Indicators(unittest.TestCase):
    def test_ema_constant(self): self.assertEqual(ema([7]*30,9),7)
    def test_rsi_flat(self): self.assertEqual(rsi([7]*30,14),50)
    def test_rsi_rising(self): self.assertEqual(rsi(list(range(30)),14),100)
    def test_rsi_falling(self): self.assertEqual(rsi(list(range(30,0,-1)),14),0)
    def test_atr(self): self.assertAlmostEqual(atr(bars(40,60),14),2)
    def test_buy(self): self.assertEqual(analyze(bars(50,60),bars(50,300),Config(),NOW)['signal'],'BUY')
    def test_sell(self): self.assertEqual(analyze(bars(50,60,-.2),bars(50,300,-.2),Config(),NOW)['signal'],'SELL')
    def test_conflict_wait(self): self.assertEqual(analyze(bars(50,60),bars(50,300,-.2),Config(),NOW)['signal'],'WAIT')
    def test_gap_rejected(self):
        b=bars(50,60); b.pop(10)
        with self.assertRaises(ValueError): analyze(b,bars(50,300),Config(),NOW)
    def test_future_rejected(self):
        with self.assertRaises(ValueError): analyze(bars(50,60),bars(50,300),Config(),NOW-1000)
    def test_stale_rejected(self):
        with self.assertRaises(ValueError): analyze(bars(50,60),bars(50,300),Config(),NOW+10000)
    def test_nan_rejected(self):
        with self.assertRaises(ValueError): replace(Config(),risk_usd=float('nan')).validate()
    def test_invalid_config(self):
        with self.assertRaises(ValueError): replace(Config(),fast=30).validate()
    def test_lot_round_down(self): self.assertEqual(lot_for_risk(.5,30,.01,10,.01,0),.01)
    def test_minimum_refusal(self): self.assertIsNone(lot_for_risk(.5,100,.01,10,.01,0))
    def test_commission_included(self): self.assertIsNone(lot_for_risk(.5,49,.01,10,.01,2))
    def test_lot_never_exceeds_budget(self):
        for loss in range(1,500):
            lots=lot_for_risk(.5,loss,.01,10,.01,7)
            if lots: self.assertLessEqual(lots*(loss+7),.5+1e-12)
    def test_identity(self):
        a=FakeMT5().account
        self.assertTrue(demo_identity(a,123,'FxPro-test'))
        for key,value in [('trade_mode',2),('server','wrong'),('login',124),('currency','EUR'),('company','Other')]:
            self.assertFalse(demo_identity(NS(**{**vars(a),key:value}),123,'FxPro-test'))

class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.fake=FakeMT5(); self.tmp=tempfile.TemporaryDirectory()
        self.runtime=Runtime(self.fake,123,'FxPro-test',db=self.tmp.name+'/db')
    def tearDown(self): self.runtime.db.close(); self.tmp.cleanup()
    def test_restart_stopped(self): self.assertEqual(self.runtime.status()['mode'],'STOPPED')
    def test_disconnected(self):
        self.fake.connected=False
        self.assertEqual(self.runtime.poll()['mode'],'FAULT')
    def test_stale_tick(self):
        self.fake.age=10000
        self.assertFalse(self.runtime.poll()['demo_verified'])
    def test_unknown_orders(self):
        self.fake.pending=None
        self.assertEqual(self.runtime.poll()['mode'],'FAULT')
    def test_real_account(self):
        self.fake.account.trade_mode=2
        self.assertFalse(self.runtime.poll()['demo_verified'])
    def test_account_switch(self):
        self.fake.switched=True
        self.assertEqual(self.runtime.poll()['mode'],'FAULT')
    def test_spread(self):
        self.fake.spread=2
        self.assertIn('Spread',self.runtime.poll()['reason'])
    def test_stale_snapshot_cannot_start(self):
        self.runtime.poll();self.runtime.state['timestamp_ms']=1
        with self.assertRaises(ValueError): self.runtime.start_simulation()
    def test_remaining_daily_budget(self):
        self.fake.deals=[NS(type=0,profit=-1.9,commission=0,swap=0,fee=0)]
        self.runtime.config=replace(Config(),costs_confirmed=True,risk_usd=5)
        self.assertIsNone(self.runtime.poll()['plan'])
    def test_non_gold_symbol(self):
        original=self.fake.symbol_info
        def wrong(*a):
            spec=original(*a);spec.currency_base='EUR';return spec
        self.fake.symbol_info=wrong
        self.assertEqual(self.runtime.poll()['mode'],'FAULT')
    def test_stop(self):
        self.runtime.poll();self.runtime.start_simulation();self.runtime.stop()
        self.assertEqual(self.runtime.poll()['mode'],'STOPPED')
    def test_lease_expiry(self):
        self.runtime.poll();self.runtime.start_simulation();self.runtime.lease=0
        self.assertEqual(self.runtime.poll()['mode'],'STOPPED')
    def test_unknown_history(self):
        self.fake.deals=None
        self.assertEqual(self.runtime.poll()['mode'],'FAULT')
    def test_daily_loss(self):
        self.fake.deals=[NS(type=0,profit=-2,commission=0,swap=0,fee=0)]
        self.assertIn('Daily loss',self.runtime.poll()['reason'])
    def test_execution_never_enabled(self):
        self.runtime.poll();self.runtime.start_simulation()
        self.assertFalse(self.runtime.poll()['execution_enabled'])
    def test_commission_must_be_confirmed(self): self.assertIn('commission',self.runtime.poll()['reason'])
    def test_minimum_lot(self):
        self.runtime.config=replace(Config(),costs_confirmed=True)
        self.assertIn('Minimum lot',self.runtime.poll()['reason'])
    def test_candidate_deduplicated(self):
        self.runtime.config=replace(Config(),costs_confirmed=True,risk_usd=5,daily_loss_usd=10)
        self.runtime.poll();self.runtime.start_simulation()
        for _ in range(10): self.runtime.poll()
        count=self.runtime.db.execute("SELECT COUNT(*) FROM events WHERE kind='DRY_RUN_CANDIDATE'").fetchone()[0]
        self.assertEqual(count,1)
    def test_config_change_stops(self):
        self.runtime.poll();self.runtime.start_simulation();self.runtime.update_config({'risk_usd':.4})
        self.assertTrue(self.runtime.stopped.is_set())

if __name__=='__main__': unittest.main()
