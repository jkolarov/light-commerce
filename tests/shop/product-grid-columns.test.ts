import { expect, it } from 'vitest'

import { gridClasses, lgColumns } from '@/modules/shop/blocks/ProductGrid/columns'

// The column rule for the product grid block: no lone card on the last row for 2-12 cards.

it.each([
  [1, 2], [2, 2], [3, 3], [4, 4], [5, 3], [6, 3], [7, 4], [8, 4], [9, 3], [10, 4], [11, 4], [12, 3],
])('%i cards use %i columns on wide screens', (count, cols) => {
  expect(lgColumns(count)).toBe(cols)
})

it('never leaves a single card alone on the last row (2-12 cards)', () => {
  for (let n = 2; n <= 12; n++) expect(n % lgColumns(n)).not.toBe(1)
})

it.each([
  [2, 'lg:grid-cols-2'], [3, 'lg:grid-cols-3'], [4, 'lg:grid-cols-4'], [6, 'lg:grid-cols-3'],
])('%i cards get the class %s and two columns on phones', (count, cls) => {
  const classes = gridClasses(count).split(' ')
  expect(classes).toContain(cls)
  expect(classes).toContain('grid-cols-2')
})
