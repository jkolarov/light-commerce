import type { Block } from 'payload'

import { callToActionBlock } from './CallToAction/config'
import { heroBlock } from './Hero/config'
import { imageTextBlock } from './ImageText/config'
import { richTextBlock } from './RichText/config'

/**
 * The CMS blocks an editor can add to a page's `layout`, in the order the admin lists them.
 * Config only: the React components are in `./components.ts`, which only routes import, so React
 * stays out of the Payload config.
 */
export const cmsBlocks: Block[] = [heroBlock, richTextBlock, imageTextBlock, callToActionBlock]
