"""Synthetic CPU measurements only. Not broker/feed latency or a profitability test."""
import json
import statistics
import time
from engine.core import Config,analyze
from tests.test_engine import bars,NOW

samples=[]
for _ in range(2000):
    start=time.perf_counter_ns()
    analyze(bars(220,60),bars(220,300),Config(),NOW)
    samples.append((time.perf_counter_ns()-start)/1e6)
samples.sort()
print(json.dumps({'kind':'synthetic_cpu_only','iterations':len(samples),'decision_ms_median':statistics.median(samples),
    'decision_ms_p95':samples[int(len(samples)*.95)],'decision_ms_max':max(samples),
    'broker_confirmation_ms':None,'live_feed_age_ms':None},indent=2))
