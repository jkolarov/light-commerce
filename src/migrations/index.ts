import * as migration_20261104_103848_baseline from './20261104_103848_baseline';

export const migrations = [
  {
    up: migration_20261104_103848_baseline.up,
    down: migration_20261104_103848_baseline.down,
    name: '20261104_103848_baseline'
  },
];
