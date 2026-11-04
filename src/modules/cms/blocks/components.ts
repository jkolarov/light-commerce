import type { ComponentType } from 'react'

import { CallToAction } from './CallToAction/Component'
import { Hero } from './Hero/Component'
import { ImageText } from './ImageText/Component'
import { RichText } from './RichText/Component'

/**
 * Components for the CMS blocks, keyed by block slug. Imported by routes only, never by the
 * Payload config. Each one gets its block's fields plus the page's `locale` from `RenderBlocks`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each block component has its own props
export const cmsBlockComponents: Record<string, ComponentType<any>> = {
  hero: Hero,
  richText: RichText,
  imageText: ImageText,
  callToAction: CallToAction,
}
