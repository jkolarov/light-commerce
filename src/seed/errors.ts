/**
 * The seed stops: bad options, broken demo data, or a database it refuses to touch. The message is
 * what `pnpm seed` prints, so it says what is wrong and what to do; `problems` lists each one.
 */
export class SeedError extends Error {
  readonly problems: string[]

  constructor(summary: string, problems: string[] = []) {
    super(problems.length ? `${summary}\n${problems.map((problem) => `  - ${problem}`).join('\n')}` : summary)
    this.name = 'SeedError'
    this.problems = problems
  }
}
