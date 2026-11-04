import { sqliteAdapter } from '@payloadcms/db-sqlite'

import { migrations } from '../migrations'

// Exactly the options of the plan's Shared contracts: busyTimeout 5000, WAL, and NO
// `transactionOptions`, so no database transactions. The ecommerce plugin's atomic claim keeps
// orders unique; transactions caused SQLITE_BUSY failures in the spike (ADR 0001, "Findings").
// WAL adds `-wal` and `-shm` files next to the database: backups must copy them too.
export const database = () =>
  sqliteAdapter({
    client: {
      url: process.env.DATABASE_URI || 'file:./data/light.db',
    },
    busyTimeout: 5000,
    // The Docker image has no Payload CLI: with NODE_ENV=production Payload applies these on start.
    prodMigrations: migrations,
    wal: true,
  })
