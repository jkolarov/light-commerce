#!/usr/bin/env python3
"""Register the demo's Stripe webhook endpoint (test mode, idempotent).

One endpoint on the Stripe TEST account for the demo's webhook URL, with the events the shop
handles (src/modules/shop/payments/stripe/webhook.ts: `payment_intent.succeeded` makes the order;
anything else would get 200 and be ignored, so it isn't subscribed):

  https://lightcommerce.fluxory.dev/api/payments/stripe/webhooks

Its signing secret goes into deploy/demo/.env as STRIPE_WEBHOOKS_SIGNING_SECRET, never to the
terminal. Restart the app afterwards (deploy/demo/deploy.sh, or `up -d app`).

Stripe shows an endpoint's signing secret only when it creates it. So:
  - no endpoint for that URL: it is created, and its secret written to .env;
  - one exists and .env has a secret: kept (its events and status are updated if they differ);
  - one exists and .env has no secret: it is deleted and created again (a new secret);
  - more than one for that URL: refuses, and lists them, to clean up by hand.
It never touches an endpoint for another URL (the account is shared with other projects).

Usage:
  deploy/demo/stripe-webhook.py            # create / update, write the secret into .env
  deploy/demo/stripe-webhook.py --check    # read-only: what exists, what would change

Key: STRIPE_SECRET_KEY from deploy/demo/.env. It must start with sk_test_.
"""
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

URL = "https://lightcommerce.fluxory.dev/api/payments/stripe/webhooks"
EVENTS = ["payment_intent.succeeded"]
# The API version of the stripe package the app uses (node_modules/stripe/esm/apiVersion.js), so
# events arrive in the shape its types describe.
API_VERSION = "2025-08-27.basil"
DESCRIPTION = "light-commerce demo (deploy/demo/stripe-webhook.py)"
ENV = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
SECRET_VAR = "STRIPE_WEBHOOKS_SIGNING_SECRET"


def read_env():
    values = {}
    if os.path.exists(ENV):
        for line in open(ENV):
            m = re.match(r"^\s*([A-Z0-9_]+)=(.*)$", line.rstrip("\n"))
            if m:
                values[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return values


def write_secret(secret):
    """Sets STRIPE_WEBHOOKS_SIGNING_SECRET in .env (replaces the line, or appends it). Keeps mode 600."""
    lines = open(ENV).read().splitlines() if os.path.exists(ENV) else []
    out, done = [], False
    for line in lines:
        if re.match(rf"^\s*{SECRET_VAR}=", line):
            out.append(f"{SECRET_VAR}={secret}")
            done = True
        else:
            out.append(line)
    if not done:
        out.append(f"{SECRET_VAR}={secret}")
    fd = os.open(ENV, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write("\n".join(out) + "\n")
    os.chmod(ENV, 0o600)


KEY = read_env().get("STRIPE_SECRET_KEY", "")
if not KEY.startswith("sk_test_"):
    sys.exit(f"refusing: STRIPE_SECRET_KEY in {ENV} is missing or not a test-mode key (sk_test_...)")
AUTH = "Basic " + base64.b64encode(f"{KEY}:".encode()).decode()


def call(method, path, params=None):
    data = urllib.parse.urlencode(params or [], doseq=True).encode() if method == "POST" else None
    url = "https://api.stripe.com/v1" + path + ("?" + urllib.parse.urlencode(params or []) if method == "GET" and params else "")
    req = urllib.request.Request(url, method=method, data=data, headers={"Authorization": AUTH})
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:500]
        sys.exit(f"{method} {path} -> HTTP {e.code}: {body}")


def endpoints_for_url():
    found, params = [], {"limit": 100}
    while True:
        page = call("GET", "/webhook_endpoints", params)
        found += [e for e in page["data"] if e["url"] == URL]
        if not page.get("has_more"):
            return found
        params = {"limit": 100, "starting_after": page["data"][-1]["id"]}


def describe(e):
    return f"{e['id']} {e['status']} events={','.join(e['enabled_events'])} api_version={e.get('api_version')}"


def create():
    params = [("url", URL), ("api_version", API_VERSION), ("description", DESCRIPTION)] + [("enabled_events[]", ev) for ev in EVENTS]
    created = call("POST", "/webhook_endpoints", params)
    write_secret(created["secret"])  # only here does Stripe return it
    return created


def main():
    check = "--check" in sys.argv[1:]
    found = endpoints_for_url()
    has_secret = bool(read_env().get(SECRET_VAR))
    print(f"url {URL}: " + ("; ".join(describe(e) for e in found) if found else "no endpoint"))
    print(f".env {SECRET_VAR}: {'set' if has_secret else 'not set'}")
    if len(found) > 1:
        sys.exit("refusing: more than one endpoint for this URL; delete the extra ones in Stripe's dashboard (test mode) first")
    if check:
        if not found:
            print("would create the endpoint and write its secret into .env")
        elif not has_secret:
            print("would delete and create the endpoint again (its secret can't be read back), and write the new secret into .env")
        else:
            print("would keep the endpoint")
        return
    if not found:
        created = create()
        print(f"created {describe(created)}; signing secret written to {ENV}")
    elif not has_secret:
        call("DELETE", f"/webhook_endpoints/{found[0]['id']}")
        created = create()
        print(f"recreated (the old secret can't be read back): {describe(created)}; signing secret written to {ENV}")
    else:
        e = found[0]
        if sorted(e["enabled_events"]) != sorted(EVENTS) or e["status"] != "enabled":
            e = call("POST", f"/webhook_endpoints/{e['id']}", [("disabled", "false")] + [("enabled_events[]", ev) for ev in EVENTS])
            print(f"updated {describe(e)}")
        else:
            print("kept")
        if e.get("api_version") != API_VERSION:
            print(f"note: its api_version is {e.get('api_version')}, not {API_VERSION}; Stripe can't change it on an existing endpoint")
    print("restart the app so it reads the secret: deploy/demo/deploy.sh (or: docker compose -p lightcommerce -f deploy/demo/compose.yml up -d app)")


if __name__ == "__main__":
    main()
