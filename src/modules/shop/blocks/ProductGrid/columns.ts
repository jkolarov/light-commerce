/**
 * Grid classes for `count` cards. Phones always get two columns. From wide screens:
 * 1-2 cards: two columns; 3, 5, 6, 9 cards: three (3, 3+2, 3+3, 3+3+3); 4, 7, 8, 10, 11 cards: four
 * (4, 4+3, 4+4, 4+4+2, 4+4+3); 12 cards: three (3x4). So 4 cards are never 3 + 1. Full class names (not built
 * from pieces) so Tailwind sees them.
 */
const BASE = 'grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-12 lg:gap-x-8 lg:gap-y-16'

export function lgColumns(count: number): 2 | 3 | 4 {
  if (count <= 2) return 2
  if (count === 3 || count === 5 || count % 3 === 0) return 3
  return 4
}

export function gridClasses(count: number): string {
  const cols = lgColumns(count)
  return `${BASE} ${cols === 2 ? 'lg:grid-cols-2' : cols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`
}
