// `pnpm generate:check`: fails if the generated files in the tree are stale.
// It regenerates them, compares with what was there, and puts the original files back,
// so running it never changes your tree. Fix a failure with `pnpm generate` and commit the result.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// The only files Payload 4 regenerates (plan, Shared contracts, "Scripts").
const generatedFiles = ['src/payload-types.ts', 'src/app/(payload)/admin/importMap.js']

const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null)
const before = new Map(generatedFiles.map((file) => [file, read(file)]))

try {
  // The committed files describe both modules, so compare with both on, whatever
  // light.config.ts or the caller's LIGHT_CI_MODULES says (src/core/generatedTypes.ts).
  execFileSync('pnpm', ['generate'], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, LIGHT_CI_MODULES: 'cms,shop' },
  })
} catch {
  restore()
  console.error('generate:check: `pnpm generate` failed (see above).')
  process.exit(1)
}

const stale = generatedFiles.filter((file) => read(file) !== before.get(file))

if (stale.length === 0) {
  console.log('generate:check: generated files are up to date.')
  process.exit(0)
}

const scratch = mkdtempSync(path.join(tmpdir(), 'lc-generate-check-'))
for (const file of stale) {
  const committed = path.join(scratch, 'committed')
  const fresh = path.join(scratch, 'regenerated')
  writeFileSync(committed, before.get(file) ?? '')
  writeFileSync(fresh, read(file) ?? '')
  const diff = spawnSync('git', ['diff', '--no-index', '--no-color', committed, fresh], {
    encoding: 'utf8',
  })
  console.error(`\n--- ${file} (in the tree) vs +++ regenerated:`)
  console.error(diff.stdout.split('\n').slice(4, 60).join('\n'))
}
rmSync(scratch, { recursive: true, force: true })
restore()

console.error(
  `\ngenerate:check: stale generated files: ${stale.join(', ')}.\n` +
    'Run `pnpm generate` and commit the result. Never edit or hand-merge these files.',
)
process.exit(1)

function restore() {
  for (const [file, content] of before) {
    if (content === null) rmSync(file, { force: true })
    else writeFileSync(file, content)
  }
}
