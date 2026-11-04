# Demo content: Les Claies

Everything the demo site shows about its fictional company, **Les Claies**, a small herbal tea farm in the Drôme. This folder holds data only, no app code.

- **S23 (demo seed)** loads `content/` and `images/` into Payload. This README is the contract it codes against: if the data and this file disagree, this file is wrong and must be fixed.
- **S22 (theme)** takes its palette, fonts and logo from `brand.md` and `images/logo.svg`.

```
demo/
  README.md               this contract
  brand.md                name, story, tone, palette, fonts, site facts
  content/
    pages/<slug>.json     one CMS page per file; <slug> is the page's FR slug
    products.json         the shop's products
    media.json            alt text for every photo in images/
    menus.json            header and footer menu items
  images/
    *.jpg                 photos (products, heroes, image + text blocks)
    logo.svg              horizontal logo, mark + wordmark
    logo-mark.svg         square mark (favicon)
    CREDITS.md            source, author and licence of every image
```

## Conventions used in every file

### Localized values

A localized value is an object with one string per locale:

```json
{ "fr": "Nos tisanes", "en": "Our herbal teas" }
```

- `fr` is the default locale. Both `fr` and `en` are present on every localized value in this data, so the fallback never kicks in. A loader should still accept a missing `en` (Payload falls back to `fr`).
- FR strings follow French typography. They contain no-break spaces (U+00A0) before `: ; ? !`, inside `« »`, between a number and its unit (`4,90 €`, `14 h`, `30 g`), and inside phone and card numbers. Apostrophes are typographic (`’`, U+2019) in both locales. Keep these characters when loading; don't trim or normalize them. The examples in this README show them as ordinary spaces.
- In the tables below, **L** means "localized value" and **L md** means "localized value whose strings are Markdown".

### Markdown

Rich text is a Markdown string. S23 converts it to Lexical. Only this subset is used:

| Syntax | Meaning |
|---|---|
| blank line | new paragraph |
| `## Title`, `### Title` | headings (h2, h3); never `#` (the page or block heading is the h1/h2 above it) |
| `**bold**`, `*italic*` | inline emphasis |
| `- item` | bulleted list |
| `1. item` | numbered list (used only for real sequences) |
| `> text` | block quote; a line `> — Name` at the end is the attribution |
| `[label](page:<page-fr-slug>)` | link to a CMS page |
| `[label](product:<product-slug>)` | link to a product page |

No HTML, images, tables, code or raw URLs appear in Markdown. Email addresses are plain text (no `mailto:`).

### Links

Links never contain URLs. A link object points to a page or a product:

```json
{ "type": "page", "slug": "livraison", "label": { "fr": "Livraison et retours", "en": "Shipping and returns" } }
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `"page"` or `"product"` | yes | |
| `slug` | string | yes | for `page`: the page's **FR slug** (its file name in `content/pages/`); for `product`: the product's slug |
| `label` | L | yes | the link text |

The same rule applies to inline Markdown links (`page:` and `product:` prefixes). Resolving them: a page link goes to that page in the current locale, using its slug for that locale (`livraison` → `/fr/livraison`, `/en/shipping`); `home` → `/fr`, `/en`. A product link goes to `/[locale]/shop/<slug>`. Every link in this data points to a page or product that exists here.

### Images

A block or product refers to an image by its **file name** in `demo/images/`, for example `"image": "garrigue.jpg"`. S23 uploads each file once to the `media` collection, with the alt text from `content/media.json`, and points every reference to that one media document.

| Role | Size (px) | Ratio |
|---|---|---|
| product photo | 1200 × 1200 | 1:1 |
| hero | 2000 × 1250 (two are 1800 × 1125 and 1600 × 1000) | 16:10 |
| image + text | 1200 × 1500 (one is 1008 × 1260) | 4:5 |

Every photo is a JPEG, at most 2000 px wide and under 400 KB, with no metadata. Sources and licences are in `images/CREDITS.md`.

### Slugs

- Pages have one slug per locale. The home page's slug is `home` in both locales.
- Products have one slug, shared by both locales.
- Slugs are lowercase ASCII with hyphens. No page slug, in either locale, is `shop`, `cart`, `checkout` or `order`: those are shop routes under the same `[locale]` segment.

### Money

`price` is an integer in **cents of EUR, tax included** (`790` = €7.90). VAT for display is 5.5% (food), set in `light.config.ts`, not here.

## `content/pages/<slug>.json`

One file per page. The file name is the page's FR slug. All pages are meant to be **published** in both locales.

| File | FR slug | EN slug | What it is |
|---|---|---|---|
| `home.json` | `home` | `home` | home page |
| `tisanes.json` | `tisanes` | `herbal-teas` | the catalogue: every product in a product grid |
| `la-ferme.json` | `la-ferme` | `the-farm` | about |
| `contact.json` | `contact` | `contact` | contact |
| `livraison.json` | `livraison` | `shipping` | shipping and returns |
| `mentions-legales.json` | `mentions-legales` | `legal` | legal notice and terms of sale; its first block says the site is a fictional demo |

`tisanes` is a sixth page, beyond the five the ticket asked for. Links can only point to pages and products, so the header's "Nos tisanes" item needs a page; this one shows all products through the `productGrid` block.

### Page fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `slug` | L | yes | slug per locale; `slug.fr` equals the file name |
| `title` | L | yes | page title (admin list, browser tab when no SEO title) |
| `seo.title` | L | yes | for the SEO plugin's meta title |
| `seo.description` | L | yes | meta description, under 160 characters |
| `seo.image` | string | no | file name in `images/`, for the share image; present on every page here |
| `layout` | block[] | yes | the page's blocks, rendered in array order; at least one |

### Blocks

Every block has a `blockType` that matches the Payload block slug: `hero`, `richText`, `imageText`, `callToAction`, `productGrid`.

The block slugs come from the plan's shared contracts. The field names inside each block were written here first, before the blocks exist (S10 builds the four CMS blocks, S20 builds `productGrid`). Those tickets should use the same field names. Where a block ends up with different names, S23 maps them, and the field meanings below still hold.

#### `hero`

| Field | Type | Required | Notes |
|---|---|---|---|
| `heading` | L | yes | plain text, one sentence at most |
| `text` | L | no | plain text (not Markdown), one or two sentences |
| `image` | string | yes | file name; a 16:10 hero photo |
| `link` | link | no | the hero's single call to action |

```json
{
  "blockType": "hero",
  "heading": {
    "fr": "Des plantes à tisane cueillies, séchées et ensachées à la ferme.",
    "en": "Herbal tea plants picked, dried and bagged on the farm."
  },
  "text": {
    "fr": "Verveine, tilleul, menthe et mauve : tout pousse sur nos terrasses des Baronnies et part chez vous en courrier suivi.",
    "en": "Lemon verbena, linden, peppermint and mallow from our terraces in the Baronnies, sent to you by tracked post."
  },
  "image": "mains-fleurs.jpg",
  "link": {
    "type": "page",
    "slug": "tisanes",
    "label": { "fr": "Voir les tisanes", "en": "See the teas" }
  }
}
```

#### `richText`

| Field | Type | Required | Notes |
|---|---|---|---|
| `content` | L md | yes | |

```json
{
  "blockType": "richText",
  "content": {
    "fr": "## De la terrasse au sachet\n\n1. **La cueillette.** À la main, au sécateur, plante par plante.\n2. **Le séchage.** À l’ombre, sur les claies du séchoir.\n3. **Le tri et l’ensachage.** Nous retirons les tiges à la main et gardons les feuilles entières.",
    "en": "## From terrace to bag\n\n1. **Picking.** By hand, with secateurs, plant by plant.\n2. **Drying.** In the shade, on the racks of the drying room.\n3. **Sorting and bagging.** We strip the stems by hand and keep the leaves whole."
  }
}
```

(Shortened here; the full text is in `pages/home.json`.)

#### `imageText`

| Field | Type | Required | Notes |
|---|---|---|---|
| `heading` | L | no | plain text |
| `content` | L md | yes | |
| `image` | string | yes | file name; a 4:5 photo |
| `imagePosition` | `"left"` or `"right"` | yes | side of the image on wide screens; on narrow screens the image goes above the text |
| `caption` | L | no | short label under the image (a place, a date) |

```json
{
  "blockType": "imageText",
  "heading": { "fr": "Combe-Rousse, 650 mètres d’altitude", "en": "Combe-Rousse, 650 metres up" },
  "content": {
    "fr": "Nos terrasses regardent le sud, au-dessus d’un vallon de chênes verts et de genêts.\n\nNous cueillons le matin, une fois la rosée partie, et la récolte est au séchoir dans l’heure.",
    "en": "Our terraces face south, above a little valley of holm oak and broom.\n\nWe pick in the morning once the dew has gone, and the harvest is in the drying room within the hour."
  },
  "image": "garrigue.jpg",
  "imagePosition": "right",
  "caption": { "fr": "Le chemin des terrasses, en juillet", "en": "The terrace path in July" }
}
```

(Shortened here; the full text is in `pages/home.json`.)

#### `callToAction`

| Field | Type | Required | Notes |
|---|---|---|---|
| `heading` | L | yes | plain text |
| `text` | L | no | plain text, one sentence |
| `link` | link | yes | the button |

```json
{
  "blockType": "callToAction",
  "heading": { "fr": "Pour offrir", "en": "To give" },
  "text": {
    "fr": "Le coffret réunit quatre tisanes en petits sachets, emballées dans du papier kraft avec une carte de la ferme.",
    "en": "The gift box holds four teas in small bags, wrapped in kraft paper with a card from the farm."
  },
  "link": {
    "type": "product",
    "slug": "coffret-quatre-tisanes",
    "label": { "fr": "Voir le coffret", "en": "See the gift box" }
  }
}
```

#### `productGrid`

Added by the shop module (S20). With the shop switched off, S23 skips these blocks.

| Field | Type | Required | Notes |
|---|---|---|---|
| `heading` | L | no | plain text |
| `mode` | `"latest"` or `"selected"` | yes | default `latest`. `selected` shows the picked products, `latest` the newest ones |
| `count` | integer, 2 to 12 | for `latest` | default 4. How many of the newest products to show |
| `products` | product ids (relationship) | for `selected` | 1 to 12, in display order. Ids, not slugs |

The seed keeps product slugs in `content/` and maps them to the created products' ids, then sets `mode: "selected"`. For a page that shows every product, use `mode: "latest"` with `count: 12`.

The example below is how `content/pages.json` writes the block today (slugs, no `mode`); the seed turns it into the table above.

```json
{
  "blockType": "productGrid",
  "heading": { "fr": "Récolte 2026", "en": "The 2026 harvest" },
  "products": ["verveine-odorante", "tilleul", "fleurs-de-mauve", "la-veillee"]
}
```

## `content/products.json`

An array of products, in catalogue order. No variants.

| Field | Type | Required | Notes |
|---|---|---|---|
| `slug` | string | yes | shared by both locales |
| `name` | L | yes | product name (the products collection's title field) |
| `summary` | L | no | one line of descriptors for product cards ("Citronnée et vive, feuilles entières") |
| `description` | L md | yes | two short paragraphs |
| `facts` | `{ "label": L, "value": L }[]` | no | key/value facts for the product page (plant, harvest, drying, net weight), in display order |
| `price` | integer | yes | cents of EUR, tax included |
| `stock` | integer | yes | units in stock, ≥ 0; the nightly reset restores this value |
| `images` | string[] | yes | file names, at least one; the first is the main photo, the rest form the gallery |

`summary` and `facts` go beyond the ecommerce plugin's default product fields. If the products collection has fields for them, map them. If not, S23 may append the facts to the description as a Markdown list, or drop both, and should say which in its PR.

```json
{
  "slug": "verveine-odorante",
  "name": { "fr": "Verveine odorante", "en": "Lemon verbena" },
  "summary": { "fr": "Citronnée et vive, feuilles entières", "en": "Bright and lemony, whole leaves" },
  "description": {
    "fr": "La verveine odorante est la plante qui a lancé la ferme : …\n\nEn tasse, elle est franchement citronnée, …",
    "en": "Lemon verbena is the plant the farm started with: …\n\nIn the cup it is clearly lemony, …"
  },
  "facts": [
    { "label": { "fr": "Plante", "en": "Plant" }, "value": { "fr": "Aloysia citrodora, feuilles", "en": "Aloysia citrodora, leaves" } },
    { "label": { "fr": "Récolte", "en": "Harvest" }, "value": { "fr": "de juin à octobre 2026", "en": "June to October 2026" } },
    { "label": { "fr": "Séchage", "en": "Drying" }, "value": { "fr": "à l’ombre, sur claies, 5 jours", "en": "in the shade, on racks, 5 days" } },
    { "label": { "fr": "Poids net", "en": "Net weight" }, "value": { "fr": "30 g, environ 25 tasses", "en": "30 g, about 25 cups" } }
  ],
  "price": 790,
  "stock": 48,
  "images": ["verveine.jpg"]
}
```

(Description shortened here with `…`; the real file has the full text.)

The six products:

| Slug | FR name | Price (cents) | Stock | Images |
|---|---|---|---|---|
| `verveine-odorante` | Verveine odorante | 790 | 48 | `verveine.jpg` |
| `tilleul` | Tilleul | 850 | 30 | `tilleul.jpg`, `tilleul-arbre.jpg` |
| `menthe-poivree` | Menthe poivrée | 690 | 40 | `menthe.jpg` |
| `fleurs-de-mauve` | Fleurs de mauve | 950 | 12 | `mauve.jpg`, `mauve-pied.jpg` |
| `la-veillee` | La Veillée | 890 | 36 | `veillee.jpg` |
| `coffret-quatre-tisanes` | Coffret quatre tisanes | 1900 | 15 | `coffret.jpg` |

## `content/media.json`

An array with one entry per photo in `images/` (logos excluded). Every file name used by a page or product appears here exactly once.

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | string | yes | file name in `images/` |
| `alt` | L | yes | alt text: what the photo shows, not what it means |

```json
{ "file": "garrigue.jpg", "alt": { "fr": "Chemin de terre entre des collines couvertes de garrigue", "en": "A dirt track through scrub-covered hills" } }
```

## `content/menus.json`

The header and footer menus (the `header` and `footer` globals). Each item is a link object (see "Links"), with `type` always `"page"` here.

```json
{
  "header": [
    { "type": "page", "slug": "tisanes", "label": { "fr": "Nos tisanes", "en": "Our teas" } },
    { "type": "page", "slug": "la-ferme", "label": { "fr": "La ferme", "en": "The farm" } },
    { "type": "page", "slug": "livraison", "label": { "fr": "Livraison", "en": "Shipping" } },
    { "type": "page", "slug": "contact", "label": { "fr": "Contact", "en": "Contact" } }
  ],
  "footer": [
    { "type": "page", "slug": "tisanes", "label": { "fr": "Nos tisanes", "en": "Our teas" } },
    { "type": "page", "slug": "la-ferme", "label": { "fr": "La ferme", "en": "The farm" } },
    { "type": "page", "slug": "livraison", "label": { "fr": "Livraison et retours", "en": "Shipping and returns" } },
    { "type": "page", "slug": "contact", "label": { "fr": "Contact", "en": "Contact" } },
    { "type": "page", "slug": "mentions-legales", "label": { "fr": "Mentions légales et CGV", "en": "Legal notice and terms" } }
  ]
}
```

Items appear in array order. The home page isn't in either menu; the logo links to it.

The footer global also has a short text under the logo. It isn't in this file: S23 takes it from the taglines in `brand.md` (the `- Tagline FR: *...*` and `- Tagline EN: *...*` lines), and leaves it empty when there are none.

## Loading order (for S23)

1. Upload every file listed in `media.json`, with its alt text in both locales.
2. Create the products. Their images refer to step 1.
3. Create the pages, publish them in both locales. Blocks refer to media (step 1) and products (step 2). Page links in blocks and Markdown can point to pages created later in this step, so create every page first and fill in links in a second pass, or resolve links by slug at render time.
4. Set the header and footer menus.

All links and image names in this folder resolve, every localized value has `fr` and `en`, and every image meets the size limits. If you change the data, keep it that way.

## What the copy assumes about `light.config.ts`

The shipping and legal pages state facts that live in config. If you change the config, change the copy too:

| Copy says | Config |
|---|---|
| €4.90 shipping per order, whatever the size | `shop.shipping.flatRate: 490` |
| Delivery to mainland France and Corsica only | `shop.shipping.countries: ['FR']` |
| Prices include VAT at 5.5% | `shop.pricesIncludeTax: true`, `shop.displayTaxRate: 5.5` |
| Prices in euros | `shop.currency: 'EUR'` |

`brand.md` lists the other suggested config values (site name, contact email, theme).
