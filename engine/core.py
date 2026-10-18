"""Pure strategy and risk policy. No network and no broker side effects."""
from dataclasses import dataclass, asdict
from decimal import Decimal, ROUND_FLOOR
from math import isfinite
import time

@dataclass(frozen=True)
class Config:
    fast: int = 9
    slow: int = 21
    period: int = 14
    buy_rsi: float = 55
    sell_rsi: float = 45
    stop_atr: float = 1.5
    reward_risk: float = 1.5
    risk_usd: float = 0.50
    daily_loss_usd: float = 2.0
    max_spread: float = 0.30
    max_tick_age_ms: int = 2000
    slippage: float = 0.10
    commission_per_lot: float = 0.0
    costs_confirmed: bool = False

    def validate(self):
        if type(self.costs_confirmed) is not bool:
            raise ValueError("cost confirmation must be boolean")
        for v in asdict(self).values():
            if not isinstance(v, (int, float)) or not isfinite(v):
                raise ValueError('non-finite configuration')
        if not (2 <= self.fast < self.slow <= 200 and 2 <= self.period <= 100):
            raise ValueError('invalid indicator periods')
        if not (0 < self.sell_rsi < 50 < self.buy_rsi < 100):
            raise ValueError('invalid RSI thresholds')
        if min(self.stop_atr, self.reward_risk, self.risk_usd, self.daily_loss_usd,
               self.max_spread, self.max_tick_age_ms) <= 0:
            raise ValueError('limits must be positive')
        if self.slippage < 0 or self.commission_per_lot < 0:
            raise ValueError('costs cannot be negative')
        if not all(isinstance(v, int) for v in (self.fast, self.slow, self.period, self.max_tick_age_ms)):
            raise ValueError('periods must be integers')

@dataclass(frozen=True)
class Bar:
    time: int
    open: float
    high: float
    low: float
    close: float


def ema(values, period):
    if len(values) < period:
        raise ValueError('insufficient EMA history')
    value = sum(values[:period]) / period
    for x in values[period:]:
        value += 2 / (period + 1) * (x - value)
    return value


def rsi(values, period):
    if len(values) < period + 1:
        raise ValueError('insufficient RSI history')
    delta = [b-a for a, b in zip(values, values[1:])]
    gain = sum(max(d, 0) for d in delta[:period]) / period
    loss = sum(max(-d, 0) for d in delta[:period]) / period
    for d in delta[period:]:
        gain = (gain * (period-1) + max(d, 0)) / period
        loss = (loss * (period-1) + max(-d, 0)) / period
    if gain == loss == 0:
        return 50.0
    return 100.0 if loss == 0 else 100 - 100 / (1 + gain/loss)


def atr(bars, period):
    ranges = [max(b.high-b.low, abs(b.high-a.close), abs(b.low-a.close))
              for a, b in zip(bars, bars[1:])]
    if len(ranges) < period:
        raise ValueError('insufficient ATR history')
    value = sum(ranges[:period]) / period
    for x in ranges[period:]:
        value = (value*(period-1)+x) / period
    return value


def validate_bars(bars, seconds, now):
    if not bars or not (0 <= now-(bars[-1].time+seconds) <= seconds*2):
        raise ValueError('stale or unclosed bars')
    for i, b in enumerate(bars):
        if not all(isfinite(v) and v > 0 for v in (b.open,b.high,b.low,b.close)):
            raise ValueError('invalid OHLC')
        if b.low > min(b.open,b.close) or b.high < max(b.open,b.close) or b.low > b.high:
            raise ValueError('invalid OHLC range')
        if b.time+seconds > now or (i and b.time-bars[i-1].time != seconds):
            raise ValueError('unclosed, duplicate or missing bars')


def analyze(m1, m5, config, now=None):
    config.validate()
    now = time.time() if now is None else now
    validate_bars(m1,60,now)
    validate_bars(m5,300,now)
    needed = max(config.slow+2,config.period+2)
    if min(len(m1),len(m5)) < needed:
        raise ValueError('insufficient history')
    a, b = [x.close for x in m1], [x.close for x in m5]
    f,s = ema(a,config.fast),ema(a,config.slow)
    f5,s5 = ema(b,config.fast),ema(b,config.slow)
    strength = rsi(a,config.period)
    volatility = atr(m1,config.period)
    momentum = a[-1]-a[-4]
    signal = 'WAIT'
    if f>s and f5>s5 and strength>=config.buy_rsi and momentum>0:
        signal='BUY'
    elif f<s and f5<s5 and strength<=config.sell_rsi and momentum<0:
        signal='SELL'
    return dict(signal=signal,ema_fast=f,ema_slow=s,ema_m5_fast=f5,ema_m5_slow=s5,
                rsi=strength,atr=volatility,momentum=momentum,bar_time=m1[-1].time)


def lot_for_risk(budget, loss_per_lot, minimum, maximum, step, commission):
    if not all(isfinite(v) for v in (budget,loss_per_lot,minimum,maximum,step,commission)):
        raise ValueError('invalid broker specification')
    if min(budget,loss_per_lot,minimum,maximum,step)<=0 or commission<0 or maximum<minimum:
        raise ValueError('invalid broker specification')
    D=lambda v: Decimal(str(v))
    cost = D(loss_per_lot)+D(commission)
    lots = (min(D(budget)/cost,D(maximum))/D(step)).to_integral_value(rounding=ROUND_FLOOR)*D(step)
    if lots<D(minimum) or lots*cost>D(budget):
        return None
    return float(lots)


def demo_identity(account, expected_login, expected_server):
    # trade_mode is the terminal enum, never inferred from a visible label.
    return bool(account and expected_login>0 and expected_server and
                account.login==expected_login and account.server==expected_server and
                account.trade_mode==0 and account.currency=='USD' and
                'fxpro' in account.company.casefold())
