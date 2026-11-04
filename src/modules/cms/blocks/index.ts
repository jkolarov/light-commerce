import type { Block } from 'payload'

/**
 * The CMS blocks an editor can add to a page's `layout`. Empty until S10 adds them.
 * Config only: the React components are in `./components.ts`, which only routes import, so React
 * stays out of the Payload config.
 */
export const cmsBlocks: Block[] = []
