// One-off: gives an empty database its schema. Until S26 adds the baseline migration, the
// container's database (NODE_ENV=production never pushes) gets its tables this way. See README.
// Run with NODE_ENV unset, so Payload pushes: `payload run scripts/docker/push-schema.ts`.
import { getPayload } from 'payload'

import config from '@payload-config'

const payload = await getPayload({ config })
payload.logger.info('Schema pushed.')
process.exit(0)
