# Demo hosting: lightcommerce.fluxory.dev

The demo runs in Docker on the owner's machine, next to booking-platform's dev stack and deployed the same way (`~/code/booking-platform/deploy/dev`). Own compose project, own tunnel, loopback-only host ports.

| | |
|---|---|
| compose project | `lightcommerce` (containers `lightcommerce-{app,mailpit,cloudflared}-1`, volume `lightcommerce_data`, network `lightcommerce_default`) |
| app | image `lightcommerce-app` (root `Dockerfile`, `runner` stage), host `127.0.0.1:3120` |
| Mailpit | UI `http://127.0.0.1:8120`, SMTP `127.0.0.1:1120` (inside the network: `mailpit:1025`). **Never routed through the tunnel.** |
| tunnel | `lightcommerce`, remotely managed; `lightcommerce.fluxory.dev` (proxied CNAME) -> `http://app:3000` for **`/healthz` only**, everything else 404 (see "Public exposure") |
| env | `deploy/demo/.env` (gitignored, copy `.env.example`) |

Host ports are overridable with `APP_PORT`, `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT` in `.env`; check `ss -ltn` first.

## First setup

```bash
cd deploy/demo
cp .env.example .env
# PAYLOAD_SECRET: openssl rand -hex 32
# STRIPE_SECRET_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: copy from ~/code/booking-platform/deploy/dev/.env,
#   they must start with sk_test_ / pk_test_
./cloudflare-tunnel.py --check      # read-only: lists tunnels and DNS, says what is free or yours
./cloudflare-tunnel.py --token      # creates/updates tunnel + CNAME; paste the printed TUNNEL_TOKEN into .env
```

`cloudflare-tunnel.py` is idempotent and only ever touches the tunnel `lightcommerce` and the record `lightcommerce.fluxory.dev`; it refuses to run if that record belongs to something else. `--delete` removes just those two. Credential: `~/.cloudflared/cert.pem.fluxory` (or `CLOUDFLARE_API_TOKEN` + account/zone ids).

## Public exposure (read before opening the site)

By default the tunnel routes **only `/healthz`**; `/`, `/admin` and `/api/*` are a 404 at the edge. Reason: until an owner account exists, Payload's `/admin` shows the create-first-user screen, and anyone on the internet could take over the demo. `./cloudflare-tunnel.py` (no flag) always restores this closed state.

**S26 must create the owner (seed) before opening the site**, then run `./cloudflare-tunnel.py --open` to route the whole site. Check `/api/users/init` returns `{"initialized":true}` first.

## Deploy

```bash
deploy/demo/deploy.sh            # rebuild from the checked-out branch, restart
deploy/demo/deploy.sh main       # reset the checkout to origin/<branch> first
deploy/demo/deploy.sh --logs     # follow app logs
```

After `up -d` it removes this project's unused images (filtered by compose label) and trims the host-wide BuildKit cache to the 20 GB most recently used, as booking-platform does. It never runs a global prune.

## Database schema (until S26)

The container runs with `NODE_ENV=production`, which never pushes the schema. For an empty volume, run S08's one-off push (see the root README, "Docker"):

```bash
docker compose -p lightcommerce -f deploy/demo/compose.yml --profile tools run --rm schema
```

It was run once on 2026-11-04 so `/admin` loads locally (`http://127.0.0.1:3120/admin`). No seed, no users, and the site is not public (see above). Do not run `down`/`up` with `--profile tools` for this; `run --rm schema` alone is enough. S26 replaces this with the baseline migration, a fresh database and the seed, plus the Stripe webhook secret and the nightly reset.

## Mail and search engines

- All email goes to Mailpit (`SMTP_HOST=mailpit`), nothing leaves the machine. Read it at `http://127.0.0.1:8120` on the machine.
- Hiding the site from search engines is the app's job (robots.txt and noindex, S12). cloudflared cannot add response headers by itself; an `X-Robots-Tag: noindex` header would need a Cloudflare Transform Rule on the zone, which this ticket does not create.
