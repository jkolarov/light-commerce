import { describe, expect, it } from 'vitest'

import en from '../../messages/en.json'
import fr from '../../messages/fr.json'

/** `{ a: { b: 'x' } }` becomes `['a.b']`. */
function keys(tree: object, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  )
}

describe('messages', () => {
  it('fr.json and en.json have the same keys', () => {
    expect(keys(fr).sort()).toEqual(keys(en).sort())
  })

  it('has no empty string', () => {
    const empty = (tree: object, prefix = ''): string[] =>
      Object.entries(tree).flatMap(([key, value]) =>
        typeof value === 'object' && value !== null ? empty(value, `${prefix}${key}.`) : value === '' ? [`${prefix}${key}`] : [],
      )
    expect(empty(fr)).toEqual([])
    expect(empty(en)).toEqual([])
  })
})
