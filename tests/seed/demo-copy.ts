import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/** The repo's demo content (`demo/`). */
export const DEMO_DIR = path.resolve(import.meta.dirname, '..', '..', 'demo')

export type DemoCopy = {
  dir: string
  /** Reads a JSON file of the copy (path relative to `content/`), changes it, writes it back. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test data of any shape
  edit: (file: string, change: (data: any) => void) => void
  remove: () => void
}

/** A throwaway copy of `demo/`, so a test can break or trim the data without touching the repo's. */
export function copyDemo(): DemoCopy {
  const dir = mkdtempSync(path.join(tmpdir(), 'lc-demo-'))
  cpSync(DEMO_DIR, dir, { recursive: true })
  return {
    dir,
    edit: (file, change) => {
      const full = path.join(dir, 'content', file)
      const data = JSON.parse(readFileSync(full, 'utf8'))
      change(data)
      writeFileSync(full, JSON.stringify(data, null, 2))
    },
    remove: () => rmSync(dir, { recursive: true, force: true }),
  }
}
