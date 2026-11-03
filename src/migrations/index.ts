import * as migration_20261103_230000_baseline from './20261103_230000_baseline';
import * as migration_20261103_230832_media_variants from './20261103_230832_media_variants';

export const migrations = [
  {
    up: migration_20261103_230000_baseline.up,
    down: migration_20261103_230000_baseline.down,
    name: '20261103_230000_baseline',
  },
  {
    up: migration_20261103_230832_media_variants.up,
    down: migration_20261103_230832_media_variants.down,
    name: '20261103_230832_media_variants'
  },
];
