#!/usr/bin/env python3
"""Tiny client for the X1018 web API (for exploring sections from the command line).

usage:
  swapi.py get  '{Section1}{Section2&filter=...}'     # GET wcd?... and print the XML
  swapi.py raw  'API/sntp_servers.htm'                 # GET any path under the build prefix
  swapi.py post '{Section}' file.xml                   # POST wcd?{Section} with an XML body
env: SW_HOST (default 192.168.2.1), SW_USER/SW_PASS (admin/admin)
The session ID is cached in $TMPDIR/x1018-session so repeated calls skip the ~8 s login.
"""
import http.client, os, re, ssl, sys, tempfile, urllib.parse

HOST = os.environ.get("SW_HOST", "192.168.2.1")
USER = os.environ.get("SW_USER", "admin")
PASS = os.environ.get("SW_PASS", "admin")
CACHE = os.path.join(tempfile.gettempdir(), "x1018-session")

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
ctx.set_ciphers("DEFAULT:AES256-GCM-SHA384:AES128-GCM-SHA256:@SECLEVEL=0")
ctx.maximum_version = ssl.TLSVersion.TLSv1_2


def req(path, method="GET", body=None, cookie=None, ctype=None):
    c = http.client.HTTPSConnection(HOST, 443, context=ctx, timeout=120)
    h = {}
    if cookie:
        h["Cookie"] = cookie
    if ctype:
        h["Content-Type"] = ctype
    c.request(method, path, body=body, headers=h)
    r = c.getresponse()
    data = r.read()
    c.close()
    return r.status, {k.lower(): v for k, v in r.getheaders()}, data


def prefix():
    st, hd, _ = req("/")
    return "/" + hd.get("location", "/").strip("/").split("/")[0]


def login(base):
    q = urllib.parse.urlencode({"action": "login", "user": USER, "password": PASS})
    st, hd, data = req(f"{base}/config/System.xml?{q}")
    code = re.search(rb"<statusCode>(\d+)", data)
    if not code or code.group(1) not in (b"0", b"00", b"12", b"10", b"13", b"9"):
        sys.exit(f"login failed: {data[:300]!r}")
    sid = hd.get("sessionid", "").split(";")[0]
    cookie = f"sessionID={sid}; userStatus=ok; ContaxUserName={USER}; PriviligeLevel=15; DeviceMode=1"
    open(CACHE, "w").write(base + "\n" + cookie)
    return cookie


def session():
    if os.path.exists(CACHE):
        base, cookie = open(CACHE).read().split("\n", 1)
        return base, cookie
    base = prefix()
    return base, login(base)


def call(path, method="GET", body=None, ctype=None):
    base, cookie = session()
    for attempt in range(2):
        st, hd, data = req(f"{base}/{path}", method, body, cookie, ctype)
        expired = st == 302 and "log_off_page" in hd.get("location", "")
        expired |= b"<statusCode>" in data[:400] and re.search(rb"<statusString>[^<]*(session|login|authent)", data[:600], re.I) is not None
        if not expired:
            return st, data
        cookie = login(base)
    return st, data


if __name__ == "__main__":
    cmd, arg = sys.argv[1], sys.argv[2]
    if cmd == "get":
        st, data = call("wcd?" + urllib.parse.quote(arg, safe="?{}&=()>|/!<,.:"))
    elif cmd == "raw":
        st, data = call(arg)
    elif cmd == "post":
        st, data = call("wcd?" + arg, "POST", open(sys.argv[3], "rb").read(), "application/x-www-form-urlencoded")
    else:
        sys.exit(__doc__)
    sys.stdout.write(data.decode("utf-8", "replace"))
    if st != 200:
        print(f"\n[HTTP {st}]", file=sys.stderr)
