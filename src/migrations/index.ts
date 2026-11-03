import * as migration_20261103_230000_baseline from './20261103_230000_baseline';

export const migrations = [
  {
    up: migration_20261103_230000_baseline.up,
    down: migration_20261103_230000_baseline.down,
    name: '20261103_230000_baseline'
  },
];
