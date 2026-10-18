"""Local MT5 bridge. Serve through an authenticated HTTPS reverse proxy for Android.
Run on Windows with an existing MT5 terminal: python -m engine.server
No password handling, no execution endpoint. Demo reads + dry-run only.
"""
import hmac
import json
import os
import signal
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from .runtime import Runtime


def make_handler(runtime,token):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):
            pass  # authorization headers and identifiers must not reach HTTP logs
        def respond(self,code,data):
            content=json.dumps(data,allow_nan=False).encode()
            self.send_response(code)
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Cache-Control','no-store')
            self.send_header('Content-Length',str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        def authorized(self):
            return hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+token)
        def do_GET(self):
            if not self.authorized():
                return self.respond(401,{'error':'unauthorized'})
            if self.path!='/status':
                return self.respond(404,{'error':'not found'})
            self.respond(200,runtime.status())
        def do_POST(self):
            if not self.authorized():
                return self.respond(401,{'error':'unauthorized'})
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<=size<=8192:
                    raise ValueError('request too large')
                body=json.loads(self.rfile.read(size) or b'{}')
                if not isinstance(body,dict):
                    raise ValueError('object required')
                if self.path=='/stop': data=runtime.stop()
                elif self.path=='/dry-run': data=runtime.start_simulation()
                elif self.path=='/heartbeat':
                    runtime.heartbeat()
                    data=runtime.status()
                elif self.path=='/config': data=runtime.update_config(body)
                else: return self.respond(404,{'error':'not found'})
                self.respond(200,data)
            except (ValueError,TypeError) as exc:
                self.respond(400,{'error':str(exc)})
    return Handler


def main():
    import MetaTrader5 as mt5
    token=os.environ.get('GOLD_BRIDGE_TOKEN','')
    if len(token)<32:
        raise SystemExit('GOLD_BRIDGE_TOKEN needs at least 32 random characters')
    login=int(os.environ['GOLD_DEMO_LOGIN'])
    server=os.environ['GOLD_DEMO_SERVER']
    if not mt5.initialize():
        raise SystemExit('Open an already signed-in MT5 Demo terminal first')
    runtime=Runtime(mt5,login,server,symbol=os.environ.get('GOLD_SYMBOL','XAUUSD'))
    quit_event=threading.Event()
    def worker():
        while not quit_event.is_set():
            runtime.poll()
            quit_event.wait(1)
    thread=threading.Thread(target=worker,daemon=True)
    thread.start()
    httpd=ThreadingHTTPServer(('127.0.0.1',8765),make_handler(runtime,token))
    def shutdown(*_):
        runtime.stop()
        quit_event.set()
        threading.Thread(target=httpd.shutdown,daemon=True).start()
    signal.signal(signal.SIGINT,shutdown)
    signal.signal(signal.SIGTERM,shutdown)
    try: httpd.serve_forever()
    finally:
        runtime.stop()
        quit_event.set()
        thread.join(timeout=5)
        httpd.server_close()
        mt5.shutdown()

if __name__=='__main__': main()
