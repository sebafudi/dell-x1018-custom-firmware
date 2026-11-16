#!/usr/bin/env python3
"""Dev server for the new X1018 web UI.

Serves the UI from webui/src at the same paths the switch will use, and proxies every
other request (wcd?, System.xml, API/*.htm, the classic UI) to the real switch. So the
UI can be developed against live data without flashing anything.

usage: python3 -I webui/dev.py [switch-ip] [port]     ->  http://127.0.0.1:8018/
"""
import http.client, http.server, os, socket, ssl, sys, threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bundle  # noqa: E402

SWITCH = sys.argv[1] if len(sys.argv) > 1 else "192.168.2.1"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8018
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
ctx.set_ciphers("DEFAULT:AES256-GCM-SHA384:AES128-GCM-SHA256:@SECLEVEL=0")
ctx.maximum_version = ssl.TLSVersion.TLSv1_2
_tls = threading.local()
_sess = {"s": None}


def upstream(method, path, body, headers):
    raw = socket.create_connection((SWITCH, 443), timeout=180)
    sock = ctx.wrap_socket(raw, server_hostname=SWITCH, session=_sess["s"])
    _sess["s"] = sock.session  # TLS session resumption, like a browser
    c = http.client.HTTPSConnection(SWITCH, 443, context=ctx, timeout=180)
    c.sock = sock
    c.request(method, path, body=body, headers=headers)
    r = c.getresponse()
    data = r.read()
    c.close()
    return r.status, r.getheaders(), data


st, hd, _ = upstream("GET", "/", None, {})
PREFIX = "/" + dict((k.lower(), v) for k, v in hd).get("location", "/").strip("/").split("/")[0]
SHELL_PATH = PREFIX + "/config/log_off_page.htm"
print(f"switch {SWITCH}, prefix {PREFIX}; open http://127.0.0.1:{PORT}/", flush=True)

TYPES = {".js": "application/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml"}


class H(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *a):
        sys.stderr.write("%s %s\n" % (self.command, self.path[:160]))

    def send(self, status, body, ctype, extra=()):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in extra:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def local(self):
        p = self.path.split("?")[0]
        if p in ("/", PREFIX, PREFIX + "/"):
            self.send(302, b"", "text/html", [("Location", SHELL_PATH)])
            return True
        if p == SHELL_PATH:
            shell = open(os.path.join(SRC, "shell.html"), encoding="utf-8").read()
            shell = shell.replace("{{CSS}}", "../css/x1018-dev.css").replace("{{JS}}", "../js/x1018-dev.js").replace("{{JS2}}", "../js/x1018-more-dev.js")
            self.send(200, shell.encode(), "text/html; charset=utf-8")
            return True
        if p in (PREFIX + "/js/x1018-dev.js", PREFIX + "/js/x1018-more-dev.js"):
            part = "more" if "more" in p else "core"
            self.send(200, bundle.js(part, minify="min" in self.path), TYPES[".js"])
            return True
        if p == PREFIX + "/css/x1018-dev.css":
            self.send(200, bundle.css(), TYPES[".css"])
            return True
        return False

    def proxy(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n) if n else None
        fwd = {k: v for k, v in self.headers.items() if k.lower() in ("cookie", "content-type", "accept", "accept-encoding", "x-requested-with")}
        try:
            st, hd, data = upstream(self.command, self.path, body, fwd)
        except Exception as e:
            self.send(502, f"upstream error: {e}".encode(), "text/plain")
            return
        extra = [(k, v) for k, v in hd if k.lower() in ("location", "content-encoding", "sessionid", "set-cookie", "etag", "expires")]
        ctype = dict((k.lower(), v) for k, v in hd).get("content-type", "application/octet-stream")
        self.send(st, data, ctype, extra)

    def do_GET(self):
        if not self.local():
            self.proxy()

    def do_POST(self):
        self.proxy()


http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
