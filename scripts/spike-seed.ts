// Spike seed (FLU-10): one admin, one page, one product. Run: pnpm payload run scripts/spike-seed.ts
import config from '@payload-config'
import { getPayload } from 'payload'

const payload = await getPayload({ config })

const richText = (text: string) => ({
  root: {
    type: 'root', direction: 'ltr', format: '', indent: 0, version: 1,
    children: [{ type: 'paragraph', direction: 'ltr', format: '', indent: 0, version: 1, textFormat: 0,
      children: [{ type: 'text', text, detail: 0, format: 0, mode: 'normal', style: '', version: 1 }] }],
  },
})

const email = process.env.SPIKE_ADMIN_EMAIL || 'admin@spike.local'
const password = process.env.SPIKE_ADMIN_PASSWORD || 'spike-admin-pw'

const existing = await payload.find({ collection: 'users', overrideAccess: true, where: { email: { equals: email } } })
if (!existing.docs.length) {
  await payload.create({ collection: 'users', overrideAccess: true, data: { email, password, name: 'Admin', roles: ['admin'] } })
}

const page = await payload.find({ collection: 'pages', overrideAccess: true, where: { slug: { equals: 'home' } } })
if (!page.docs.length) {
  await payload.create({
    collection: 'pages',
    overrideAccess: true,
    context: { disableRevalidate: true },
    data: { title: 'Home', slug: 'home', _status: 'published', hero: { type: 'none' }, layout: [{ blockType: 'banner', style: 'info', content: richText('Welcome to the spike shop.') }] } as never,
  })
}

const product = await payload.find({ collection: 'products', overrideAccess: true, where: { slug: { equals: 'honey-jar' } } })
if (!product.docs.length) {
  await payload.create({
    collection: 'products',
    overrideAccess: true,
    context: { disableRevalidate: true },
    data: {
      title: 'Honey jar',
      slug: 'honey-jar',
      _status: 'published',
      priceInEUREnabled: true,
      priceInEUR: 1250,
      inventory: 20,
      enableVariants: false,
    } as never,
  })
}

const p = await payload.find({ collection: 'products', overrideAccess: true, where: { slug: { equals: 'honey-jar' } } })
console.log(JSON.stringify({ product: { id: p.docs[0]?.id, priceInEUR: (p.docs[0] as any)?.priceInEUR, inventory: (p.docs[0] as any)?.inventory } }))
await payload.destroy?.()
process.exit(0)
