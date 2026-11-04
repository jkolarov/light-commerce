import type { MetadataRoute } from 'next'

// Types the modules share with the public site (plan, "What modules give the public site").

/** A menu link, already resolved for one locale. */
export type NavItem = { label: string; href: string }

/** One `sitemap.xml` entry, as `src/app/sitemap.ts` (S12) returns it. */
export type SitemapEntry = MetadataRoute.Sitemap[number]
