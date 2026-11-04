import type { ComponentType } from 'react'

import type { Locale } from '@/core/i18n/locales'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each block component has its own props
export type BlockComponents = Record<string, ComponentType<any>>

export type RenderBlocksProps = {
  // `unknown[]` while `cmsBlocks` is empty: Payload then types `layout` as unknown.
  blocks: ReadonlyArray<unknown> | null | undefined
  /** Block components keyed by block slug: `{ ...cmsBlockComponents, ...shop blockComponents }`. */
  components: BlockComponents
  /** Passed to every block, so blocks can build links and format text for the page's language. */
  locale?: Locale
}

/** Renders a page's `layout`, in order. A block with no component is skipped, never an error. */
export function RenderBlocks({ blocks, components, locale }: RenderBlocksProps) {
  if (!blocks?.length) return null
  return (
    <>
      {(blocks as ReadonlyArray<{ id?: string | null; blockType: string }>).map((block, index) => {
        const Component = components[block.blockType]
        if (!Component) return null
        return <Component key={block.id ?? index} {...block} locale={locale} />
      })}
    </>
  )
}
