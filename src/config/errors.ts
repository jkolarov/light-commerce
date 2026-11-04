import type * as z from 'zod'

/**
 * light.config.ts (or the CI module override) is broken. The message lists every problem, one per
 * line as `path: what is wrong`, because the message is what startup logs and test output show.
 */
export class LightConfigError extends Error {
  /** One line per problem, for example `theme.colors.primary: expected a CSS colour, like ...`. */
  readonly problems: string[]

  constructor(problems: string[], source = 'light.config.ts') {
    const count = problems.length === 1 ? '1 problem' : `${problems.length} problems`
    super(`${source} is not valid (${count}):\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
    this.name = 'LightConfigError'
    this.problems = problems
  }
}

const expectedTypes: Record<string, string> = {
  string: 'expected text',
  boolean: 'expected true or false',
  number: 'expected a number',
  array: 'expected a list, like [...]',
  object: 'expected a section, like { ... }',
}

/** Turns zod issues into `path: plain words` lines. The schema words most messages itself. */
export function formatProblems(issues: readonly z.core.$ZodIssue[]): string[] {
  return issues.flatMap((issue): string[] => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => `${formatPath([...issue.path, key])}: unknown setting`)
    }
    return [`${formatPath(issue.path)}: ${describe(issue)}`]
  })
}

function describe(issue: z.core.$ZodIssue): string {
  // A missing setting fails a type check, or a choice check for enums and literals.
  if ((issue.code === 'invalid_type' || issue.code === 'invalid_value') && issue.input === undefined) {
    return 'is missing'
  }
  if (issue.code === 'invalid_type') {
    // `int` and other refined types keep the schema's own message.
    const expected = expectedTypes[issue.expected]
    if (expected) return expected
  }
  return issue.message
}

/** `['locales', 'available', 1]` → `locales.available[1]`. */
function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return '(the whole config)'
  return path
    .map((key, index) => (typeof key === 'number' ? `[${key}]` : `${index === 0 ? '' : '.'}${String(key)}`))
    .join('')
}
