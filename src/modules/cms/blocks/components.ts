import type { ComponentType } from 'react'

/** Components for the CMS blocks, keyed by block slug. Empty until S10. Imported by routes only. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each block component has its own props
export const cmsBlockComponents: Record<string, ComponentType<any>> = {}
