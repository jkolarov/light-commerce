#!/usr/bin/env python3
"""Create / update the Cloudflare tunnel of the demo (idempotent).

One dedicated, remotely-managed tunnel named `lightcommerce`, one public hostname on the
fluxory.dev zone:

  lightcommerce.fluxory.dev -> http://app:3000     (everything else: 404 at the edge)

`app` is the compose service name: cloudflared runs inside the compose network
(deploy/demo/compose.yml), so nothing is published on the host for the tunnel. Mailpit is
never routed.

Safety: the script only touches the tunnel TUNNEL_NAME and the record HOST. It refuses to
run if that name or record already belongs to something else (a record that is not a CNAME
to this tunnel, or a tunnel whose DNS target is not its own).

Credential: CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_ZONE_ID), else the
apiToken/accountID/zoneID in ~/.cloudflared/cert.pem.fluxory.

Usage:
  deploy/demo/cloudflare-tunnel.py --check    # read-only: list tunnels and DNS, report what would change
  deploy/demo/cloudflare-tunnel.py            # create/update, print tunnel id
  deploy/demo/cloudflare-tunnel.py --token    # ... and print the run token (TUNNEL_TOKEN in .env)
  deploy/demo/cloudflare-tunnel.py --delete   # remove this DNS record and this tunnel only
"""
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request

TUNNEL_NAME = "lightcommerce"
HOST = "lightcommerce.fluxory.dev"
ORIGIN = "http://app:3000"
CERT = os.path.expanduser("~/.cloudflared/cert.pem.fluxory")
API = "https://api.cloudflare.com/client/v4"


def creds():
    tok, acct, zone = (os.environ.get(k) for k in ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_ZONE_ID"))
    if tok and acct and zone:
        return tok, acct, zone
    raw = open(CERT).read()
    b64 = re.search(r"-----BEGIN ARGO TUNNEL TOKEN-----(.*?)-----END ARGO TUNNEL TOKEN-----", raw, re.S).group(1)
    d = json.loads(base64.b64decode(b64))
    return d["apiToken"], d["accountID"], d["zoneID"]


TOKEN, ACCOUNT, ZONE = creds()


def call(method, path, body=None):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    )
    try:
        res = json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} -> HTTP {e.code}: {e.read().decode()[:500]}")
    if not res.get("success"):
        sys.exit(f"{method} {path} -> {json.dumps(res.get('errors'))}")
    return res["result"]


def find_tunnel():
    for t in call("GET", f"/accounts/{ACCOUNT}/cfd_tunnel?is_deleted=false&name={TUNNEL_NAME}"):
        if t["name"] == TUNNEL_NAME:
            return t
    return None


def dns_record():
    recs = call("GET", f"/zones/{ZONE}/dns_records?name={HOST}")
    return recs[0] if recs else None


def check(t):
    """Read-only report. Exits non-zero if the name or record belongs to something else."""
    print("existing tunnels:", ", ".join(sorted(x["name"] for x in call("GET", f"/accounts/{ACCOUNT}/cfd_tunnel?is_deleted=false"))) or "(none)")
    rec = dns_record()
    print(f"tunnel {TUNNEL_NAME}: " + (f"exists {t['id']}" if t else "free"))
    print(f"dns {HOST}: " + (f"{rec['type']} {rec['content']} proxied={rec.get('proxied')}" if rec else "free"))
    if rec and not (rec["type"] == "CNAME" and t and rec["content"] == f"{t['id']}.cfargotunnel.com"):
        sys.exit(f"refusing: {HOST} exists and is not a CNAME to the {TUNNEL_NAME} tunnel")


def main():
    args = set(sys.argv[1:])
    t = find_tunnel()
    if "--check" in args:
        check(t)
        return
    if "--delete" in args:
        rec = dns_record()
        if rec and rec["type"] == "CNAME" and t and rec["content"] == f"{t['id']}.cfargotunnel.com":
            call("DELETE", f"/zones/{ZONE}/dns_records/{rec['id']}")
            print(f"dns {HOST}: deleted")
        if t:
            call("DELETE", f"/accounts/{ACCOUNT}/cfd_tunnel/{t['id']}?cascade=true")
            print(f"tunnel {TUNNEL_NAME}: deleted")
        return
    check(t)  # refuses to continue if the record is someone else's
    if not t:
        t = call("POST", f"/accounts/{ACCOUNT}/cfd_tunnel", {"name": TUNNEL_NAME, "config_src": "cloudflare"})
        print(f"tunnel {TUNNEL_NAME}: created {t['id']}")
    ingress = [{"hostname": HOST, "service": ORIGIN}, {"service": "http_status:404"}]
    call("PUT", f"/accounts/{ACCOUNT}/cfd_tunnel/{t['id']}/configurations", {"config": {"ingress": ingress}})
    print("ingress: " + ", ".join(f"{r.get('hostname', '*')} -> {r['service']}" for r in ingress))
    target = f"{t['id']}.cfargotunnel.com"
    body = {"type": "CNAME", "name": HOST, "content": target, "proxied": True, "ttl": 1,
            "comment": f"cloudflared tunnel {TUNNEL_NAME} (light-commerce demo)"}
    rec = dns_record()
    if not rec:
        call("POST", f"/zones/{ZONE}/dns_records", body)
        print(f"dns {HOST} -> {target}: created")
    elif rec["content"] == target and rec.get("proxied"):
        print(f"dns {HOST} -> {target}: kept")
    else:
        call("PATCH", f"/zones/{ZONE}/dns_records/{rec['id']}", body)
        print(f"dns {HOST} -> {target}: updated")
    if "--token" in args:
        print("TUNNEL_TOKEN=" + call("GET", f"/accounts/{ACCOUNT}/cfd_tunnel/{t['id']}/token"))


if __name__ == "__main__":
    main()
