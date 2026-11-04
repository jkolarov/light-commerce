import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-sqlite'

// The production container runs these on start (`prodMigrations` in src/core/db.ts).
// Empty until S26 adds the baseline migration: `pnpm payload migrate:create` then rewrites this file.
export const migrations: {
  down: (args: MigrateDownArgs) => Promise<void>
  name: string
  up: (args: MigrateUpArgs) => Promise<void>
}[] = []
