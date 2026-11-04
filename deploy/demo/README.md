# Demo hosting: lightcommerce.fluxory.dev

The demo runs in Docker on the owner's machine, next to booking-platform's dev stack and deployed the same way (`~/code/booking-platform/deploy/dev`). Own compose project, own tunnel, loopback-only host ports.

| | |
|---|---|
| compose project | `lightcommerce` (containers `lightcommerce-{app,mailpit,cloudflared}-1`, volume `lightcommerce_data`, network `lightcommerce_default`) |
| app | image `lightcommerce-app` (root `Dockerfile`, `runner` stage), host `127.0.0.1:3120` |
| seed, reset | image `lightcommerce-tools` (`schema` stage: the Payload CLI), one-off containers on the app's volume (`--profile tools`, never started by `up`) |
| Mailpit | UI `http://127.0.0.1:8120`, SMTP `127.0.0.1:1120` (inside the network: `mailpit:1025`). **Never routed through the tunnel.** |
| tunnel | `lightcommerce`, remotely managed; `lightcommerce.fluxory.dev` (proxied CNAME) -> `http://app:3000`, the whole site (`--open`, see "Public exposure") |
| Stripe | test mode; webhook endpoint `https://lightcommerce.fluxory.dev/api/payments/stripe/webhooks` (`payment_intent.succeeded`) |
| checkout | the dedicated clone `/home/jkolarov/code/light-commerce-demo`, on `main` (see "Where the demo runs from") |
| env | `deploy/demo/.env` in that clone (gitignored, mode 600, copy `.env.example`); never in an image (`.dockerignore`) |
| owner | `SEED_OWNER_EMAIL` in `.env`; the password is in `.env` too, and only there |

Host ports are overridable with `APP_PORT`, `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT` in `.env`; check `ss -ltn` first.

## Where the demo runs from

From its own clone, **`/home/jkolarov/code/light-commerce-demo`**, on `main`, as booking-platform deploys from its own checkout. Not from the main checkout (`/home/jkolarov/code/light-commerce`, where tickets are merged) and not from a ticket's worktree: a ticket's worktree is removed when its PR merges, and with it `deploy/demo/.env` (the only copy of the secrets and the owner's password), the nightly job's script and the `demo/` folder the seed reads. Deploy, reset and edit `.env` in the clone. (Until the move after FLU-35, the demo ran from the worktree `.worktrees/demo`.)

```bash
cd /home/jkolarov/code/light-commerce-demo
deploy/demo/deploy.sh main       # fetch, reset the checkout to origin/main, rebuild, restart
deploy/demo/deploy.sh            # rebuild what is checked out, restart
deploy/demo/deploy.sh --logs     # follow app logs
```

`deploy.sh`:

1. builds the app and the seed/reset image (so the nightly job never runs older code than the app);
2. copies the database (`backup-db.sh`: `VACUUM INTO`, consistent while the app runs) into the volume's `backups/` folder, keeping the last 3, before the new image applies any migration; a failed copy stops the deploy;
3. runs `up -d --wait`: it returns once the app's health check passes. The app applies pending migrations before it answers and exits if one fails, so a broken migration fails the deploy (and shows as a restart loop in `docker compose ps`) instead of leaving a healthy container that answers 500s;
4. removes this project's untagged images (by compose label) and trims the host-wide BuildKit cache to the 20 GB most recently used, as booking-platform does. It never runs a global prune.

To restore a copy: see the comment at the top of `backup-db.sh`.

**Keep an offline copy of `.env`** (in the owner's password manager, for example): it is the only place the owner's password, the webhook signing secret and the tunnel token live. Lost, they can be made again: a password reset by email lands in Mailpit, `./stripe-webhook.py` makes a new endpoint and secret, `./cloudflare-tunnel.py --token --open` prints the token again.

**Images never hold `.env`.** `.dockerignore` leaves out every `.env*` file in the tree (`.env.example` aside), `deploy/` and `logs/`, and CI checks that the images hold none. Images built before 2026-11-04 (FLU-35's fix round) did copy `deploy/demo/.env` into the seed/reset image: those images are removed, but BuildKit's local cache on this machine may still hold such layers until it ages out (`docker builder prune --max-used-space 20GB` in `deploy.sh`). The cache never leaves the machine; don't run a global `docker builder prune` for it, which drops every other project's cache too.

## First setup (done on 2026-11-04, for the record)

The order matters: the app refuses to start without the webhook's signing secret, and the site opens only once the owner exists.

```bash
cd deploy/demo
cp .env.example .env    # PAYLOAD_SECRET: openssl rand -hex 32
                        # STRIPE_SECRET_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: from
                        #   ~/code/booking-platform/deploy/dev/.env, sk_test_ / pk_test_ only
                        # SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD (openssl rand -base64 24)
./cloudflare-tunnel.py --check      # read-only: lists tunnels and DNS, says what is free or yours
./cloudflare-tunnel.py --token      # creates/updates tunnel + CNAME (closed); paste TUNNEL_TOKEN into .env
./stripe-webhook.py                 # registers the webhook endpoint, writes its secret into .env
cd ../..
docker compose -p lightcommerce -f deploy/demo/compose.yml down -v   # this project only: a fresh volume
deploy/demo/deploy.sh                                                # the app migrates the new database
docker compose -p lightcommerce -f deploy/demo/compose.yml run --rm -T seed   # demo company + owner
curl -s http://127.0.0.1:3120/api/users/init                        # must say {"initialized":true}
deploy/demo/cloudflare-tunnel.py --open                             # only now: the whole site
```

## Database

The app applies the migrations in `src/migrations/` as it starts (`prodMigrations`, run from `src/instrumentation.ts`), before it answers anything, `/healthz` included, and exits if one fails. So a new volume gets its tables on the first start, and a deploy with a new migration applies it (after `deploy.sh` has copied the database). Nothing pushes the schema here: a pushed database can't be migrated afterwards (the root README, "Docker"). The seed and the reset run with `NODE_ENV=production` for the same reason, and apply pending migrations too when they start.

The volume holds the SQLite file (with WAL's `-wal`/`-shm`) and the uploads. `down -v` deletes all of it, the owner account included: run the seed again afterwards, before opening the site.

## Stripe webhook

`deploy/demo/stripe-webhook.py` registers one endpoint on the **test** account (it refuses a key that isn't `sk_test_`) for `https://lightcommerce.fluxory.dev/api/payments/stripe/webhooks`, with the one event the shop acts on, `payment_intent.succeeded`, and writes its signing secret into `.env` as `STRIPE_WEBHOOKS_SIGNING_SECRET` without printing it. It is idempotent: it keeps an endpoint it finds when `.env` has the secret, and deletes and creates it again when `.env` doesn't (Stripe shows a secret only once). It never touches the account's other endpoints (other projects use the same test account). `--check` only reports. After it writes a secret, restart the app (`deploy.sh`, or `docker compose -p lightcommerce -f deploy/demo/compose.yml up -d app`).

The endpoint refuses unsigned requests (400). PaymentIntents of other projects on the same account get 200 and are ignored.

## Nightly reset

Every night at about 03:30 (Europe/Zurich), cron runs `deploy/demo/reset.sh` from the demo's clone. In a one-off `reset` container on the app's database (`src/seed/reset.ts`), it:

1. settles payments left behind (`reconcilePayments`: a paid payment whose webhook never came becomes an order, its emails go out, unpaid ones expire);
2. deletes the orders, transactions, carts and addresses created before it started (nothing a visitor makes while it runs), except a payment touched in the last hour that is still `pending` or `processing`, with its cart (someone paying at that moment still gets their order). Before a transaction goes, its PaymentIntent is checked at Stripe: one that can still be paid is cancelled there first (a tab left open can't pay it with no order to make), a paid one is settled and kept, and one Stripe is still settling, or can't be checked, is kept for the next night;
3. deletes the pages, products and photos the demo doesn't have (what was added in the admin), except a product such a payment is for;
4. runs the seed again: the demo's text, photos, menus and stock as in `demo/`.

It never deletes users, and never needs the owner's password: the owner keeps theirs. It stops before deleting anything if `demo/` can't be read or the owner account (`SEED_OWNER_EMAIL`) doesn't exist. Two runs never overlap (`flock`).

By hand, any time:

```bash
/home/jkolarov/code/light-commerce-demo/deploy/demo/reset.sh
```

It prints what it did and appends the same to `deploy/demo/logs/reset.log` (gitignored). The crontab line (`crontab -l`; the machine runs on UTC, so it fires at 01:30 and 02:30 UTC and runs only when it is 03 o'clock in Zurich, which keeps 03:30 through daylight saving time). What cron itself sees (a script that can't even start, a missing checkout) goes to a log outside the checkout:

```
30 1,2 * * * [ "$(TZ=Europe/Zurich date +\%H)" = "03" ] && /home/jkolarov/code/light-commerce-demo/deploy/demo/reset.sh >> /home/jkolarov/lightcommerce-reset-cron.log 2>&1
```

## Public exposure (read before opening the site)

`./cloudflare-tunnel.py --open` routes the whole site; it has been open since 2026-11-04, after the owner account was seeded. Without `--open`, the script (with no flag, or `--token`) routes **only `/healthz`**, and `/`, `/admin` and `/api/*` are a 404 at the edge. **So every later run, `--token` included, must also pass `--open`, or it closes the site again.** The closed state is for a volume with no user: Payload's `/admin` then shows the create-first-user screen, and anyone on the internet could take over the demo. After a `down -v`, close the site (`./cloudflare-tunnel.py`), seed, check `/api/users/init` says `{"initialized":true}`, then open it again.

`cloudflare-tunnel.py` is idempotent and only ever touches the tunnel `lightcommerce` and the record `lightcommerce.fluxory.dev`; it refuses to run if that record belongs to something else. `--delete` removes just those two. Credential: `~/.cloudflared/cert.pem.fluxory` (or `CLOUDFLARE_API_TOKEN` + account/zone ids).

## Mail and search engines

- All email goes to Mailpit (`SMTP_HOST=mailpit`), nothing leaves the machine. Read it at `http://127.0.0.1:8120` on the machine. The tunnel routes only the app, so Mailpit can't be reached through it. The reset doesn't empty Mailpit (it keeps its last 500 messages); order numbers start again after a reset, so an old "Commande n° 1" may sit next to a new one.
- Hidden from search engines by the app (S12): `robots.txt` disallows everything, and every response, `/admin` and `/api` included, has `X-Robots-Tag: noindex, nofollow` (`site.indexable: false` in `light.config.ts`).
