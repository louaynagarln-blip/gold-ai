import json
import threading
import unittest
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from engine.server import make_handler
from test_engine import FakeMT5
from engine.runtime import Runtime

class ServerTests(unittest.TestCase):
    def setUp(self):
        self.runtime=Runtime(FakeMT5(),123,'FxPro-test',db=':memory:')
        self.server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(self.runtime,'t'*32))
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True); self.thread.start()
        self.url='http://127.0.0.1:'+str(self.server.server_port)
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.runtime.db.close()
    def request(self,path,method='GET',body=None,authorized=True):
        headers={'Authorization':'Bearer '+'t'*32} if authorized else {}
        req=urllib.request.Request(self.url+path,method=method,headers=headers,
            data=json.dumps(body or {}).encode() if method=='POST' else None)
        try:
            with urllib.request.urlopen(req,timeout=2) as response: return response.status,json.load(response)
        except urllib.error.HTTPError as exc: return exc.code,json.load(exc)
    def test_authorization_required(self): self.assertEqual(self.request('/status',authorized=False)[0],401)
    def test_no_execution_endpoint(self): self.assertEqual(self.request('/trade','POST')[0],404)
    def test_unverified_start_blocked(self): self.assertEqual(self.request('/dry-run','POST')[0],400)
    def test_stop(self): self.assertEqual(self.request('/stop','POST')[1]['mode'],'STOPPED')
    def test_invalid_config(self): self.assertEqual(self.request('/config','POST',{'risk_usd':-1})[0],400)
    def test_unknown_config(self): self.assertEqual(self.request('/config','POST',{'live_enabled':True})[0],400)
    def test_status_no_execution(self): self.assertFalse(self.request('/status')[1]['execution_enabled'])
