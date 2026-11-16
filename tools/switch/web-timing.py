#!/usr/bin/env python3
"""Time the X1018 web UI the way a browser would hit it.

Logs in, then measures: Home.htm, every asset it references (fresh connection per
request since the switch sends Connection: close, with TLS session resumption like a
browser), and the dashboard's wcd? data queries.

usage: web-timing.py [host] [user] [password]
"""
import http.client, re, socket, ssl, sys, time, urllib.parse

HOST = sys.argv[1] if len(sys.argv) > 1 else "192.168.2.1"  # factory default address
USER = sys.argv[2] if len(sys.argv) > 2 else "admin"
PASS = sys.argv[3] if len(sys.argv) > 3 else "admin"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
ctx.set_ciphers("DEFAULT:AES256-GCM-SHA384:AES128-GCM-SHA256:@SECLEVEL=0")  # switch only offers RSA kex
ctx.maximum_version = ssl.TLSVersion.TLSv1_2
tls_session = None
cookies = {}


def req(path, method="GET", body=None, resume=True):
    """One request on a fresh connection. Returns (status, headers, body, seconds, resumed)."""
    global tls_session
    t0 = time.monotonic()
    c = http.client.HTTPSConnection(HOST, 443, context=ctx, timeout=120)
    raw = socket.create_connection((HOST, 443), timeout=120)
    c.sock = ctx.wrap_socket(raw, server_hostname=HOST,
                             session=tls_session if resume else None)
    tls_session = c.sock.session
    resumed = c.sock.session_reused
    h = {}
    if cookies:
        h["Cookie"] = "; ".join(f"{k}={v}" for k, v in cookies.items())
    if body is not None:
        h["Content-Type"] = "application/x-www-form-urlencoded"
    c.request(method, path, body=body, headers=h)
    r = c.getresponse()
    data = r.read()
    c.close()
    return r.status, dict(r.getheaders()), data, time.monotonic() - t0, resumed


# 1. find the session prefix (/csXXXXXXXX/)
st, hd, _, dt, _ = req("/", resume=False)
prefix = hd.get("Location", "/").rstrip("/").split("/")[1] if st == 302 else ""
base = f"/{prefix}"
print(f"redirect to {base}/  ({dt:.2f}s, full TLS handshake)")

# 2. log in
q = urllib.parse.urlencode({"action": "login", "user": USER, "password": PASS})
st, hd, data, dt, _ = req(f"{base}/config/System.xml?{q}")
sid = hd.get("sessionID", "")
code = re.search(rb"<statusCode>(\d+)", data)
print(f"login: HTTP {st}, statusCode {code.group(1).decode() if code else '?'}  ({dt:.2f}s)")
if sid:
    cookies["sessionID"] = sid.split(";")[0]
cookies.update({"userStatus": "ok", "ContaxUserName": USER, "PriviligeLevel": "15", "DeviceMode": "1"})

# 3. Home.htm + assets
st, hd, home, dt, res = req(f"{base}/home.htm")
print(f"home.htm: HTTP {st}, {len(home)} bytes ({dt:.2f}s, resumed={res})")
assets = re.findall(rb'(?:src|href)="(\./[^"]+|(?:css|js|images|clarity)/[^"]+)"', home)
assets = list(dict.fromkeys(a.decode().lstrip("./") for a in assets))
tot = 0.0
slow = []
for a in assets:
    st, hd, data, dt, res = req(f"{base}/{a}")
    tot += dt
    slow.append((dt, a, st, len(data), res))
slow.sort(reverse=True)
print(f"\n{len(assets)} assets referenced by home.htm, fetched one at a time: {tot:.1f}s total")
print("  slowest:")
for dt, a, st, n, res in slow[:8]:
    print(f"    {dt:5.2f}s  HTTP {st} {n:>7}B resumed={res}  {a}")

# 4. dashboard data queries (what Dashboard.GetDataFromServer asks for)
sections = ("{PortAppliedMacroList&interfaceType=1}{VLANCurrentStatus}{DiagnosticsUnitList}"
            "{VLANMembershipInterfaceList&interfaceType=1}{LACPPortList&filter=actorAdminKey>0}"
            "{MemoryLogTable&count=3}{SyslogSeverityCounters}{StackInfoTable}{SystemGlobalSetting}"
            "{SNMPGlobalSetting}{CommunityList}{AdminUserSetting}{IPv4InterfaceList&filter=(IPAddr>=1.0.0.0)}"
            "{TimeSetting}{IPv4GatewayList}")
print("\ndashboard data:")
for label, path in [("big sections query", f"wcd?{sections}"),
                    ("ConfigInfoStatus", "wcd?{ConfigInfoStatus}"),
                    ("ConfigInfoOutputList", "wcd?{ConfigInfoOutputList}"),
                    ("MemoryLogTable", "wcd?{MemoryLogTable}")]:
    st, hd, data, dt, res = req(f"{base}/" + urllib.parse.quote(path, safe="?{}&=()>|/"))
    print(f"  {dt:5.2f}s  HTTP {st} {len(data):>7}B  {label}")
