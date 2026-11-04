import type { ComponentType } from 'react'
import type { Block } from 'payload'

/** The CMS blocks an editor can add to a page's `layout`. Empty until S10 adds them. */
export const cmsBlocks: Block[] = []

/** Components for the CMS blocks, keyed by block slug. Empty until S10. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each block component has its own props
export const cmsBlockComponents: Record<string, ComponentType<any>> = {}
