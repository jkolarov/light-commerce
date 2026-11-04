// One-off: pushes the schema into a fresh database meant for development only (what `pnpm dev`
// does on start), for example a copy to try a seed on. Never on a database a container serves:
// containers apply the migrations in src/migrations on start, and `payload migrate` refuses a
// database that was pushed (README, "Docker"). Run with NODE_ENV unset (the `schema` image sets
// production: pass `-e NODE_ENV=`): `payload run scripts/docker/push-schema.ts`.
import { getPayload } from 'payload'

import config from '@payload-config'

const payload = await getPayload({ config })
payload.logger.info('Schema pushed.')
process.exit(0)
