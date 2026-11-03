# Les Claies: brand

Les Claies is the fictional company of the light-commerce demo: a two-person herbal tea farm on terraces in the Baronnies provençales (Drôme). It grows, dries and bags its plants and sends them by post. Nothing about it is real: not the people, the farm, the village (Montaurel), the hamlet (Combe-Rousse), the address, the phone number or the email.

It was picked because it shows both halves of the product. The shop gets six light, cheap-to-post products with a real stock story (small harvests, a 2026 vintage). The CMS gets the content every small producer has: a place, two people, a process, shipping terms.

## Name

**Les Claies**. A *claie* is a flat wooden frame stretched with mesh, used to dry plants in the shade. The farm dries everything on them, hence the name. Always written "Les Claies", with both capitals, in both languages. Never "LesClaies", "LES CLAIES" or "Claies".

- Tagline FR: *Plantes à tisane cultivées et séchées dans les Baronnies*
- Tagline EN: *Herbal tea plants grown and dried in the Baronnies*

## Story

**FR.** Les Claies est une petite ferme de plantes à tisane sur les terrasses de Combe-Rousse, à 650 mètres d’altitude, dans les Baronnies provençales. Hélène Vidal y a repris en 2015 les restanques de son grand-père, laissées à la friche depuis vingt ans ; Samir Benali, menuisier, l’a rejointe en 2018 et a monté le séchoir dans l’ancienne bergerie. On y cultive la verveine, la menthe, la mélisse et la mauve, on cueille le tilleul sur les vieux arbres du hameau, et tout sèche à l’ombre sur des claies, ces cadres de bois tendus de grillage qui ont donné son nom à la ferme. Les feuilles restent entières, chaque sachet porte son année de récolte, et les commandes partent deux fois par semaine.

**EN.** Les Claies is a small herbal tea farm on the terraces of Combe-Rousse, 650 metres up in the Baronnies provençales. In 2015 Hélène Vidal took back her grandfather’s terraces, left to the scrub for twenty years; Samir Benali, a joiner, joined her in 2018 and built the drying room in the old sheep barn. They grow lemon verbena, peppermint, lemon balm and mallow, pick linden from the old trees around the hamlet, and dry everything in the shade on claies, wooden frames stretched with mesh, which gave the farm its name. Leaves stay whole, every bag carries its harvest year, and orders go out twice a week.

## Tone of voice

Two people who do the work themselves and write their own website.

- **"Nous", and "vous" for customers.** Never "tu". In English, "we" and "you".
- **Concrete.** Plants, months, grams, days, metres, names. "Nous coupons la menthe deux fois par été" rather than "une menthe d’exception".
- **Short sentences, plain verbs.** One idea per sentence. Sentence case for headings.
- **No sales filler.** No "passionnés", "authentique", "savoir-faire ancestral", "le meilleur", "qualité premium", no "Bienvenue sur notre boutique", no stat rows, no trust badges.
- **No health claims, ever.** Food law forbids them and they would read as quackery. Describe taste, colour, harvest, how to brew and the time of day ("à boire le soir"). Never say a plant soothes, cures, detoxes, helps you sleep or "is good for" anything.
- **French first.** Write the French, then write the English for an English reader with the same facts. Don't translate word for word. French copy uses French typography: no-break space before `: ; ? !`, « guillemets », `4,90 €`, `14 h`.
- **Honest about being small.** "Nous n’avons pas de label", "notre récolte la plus petite". Small and specific beats big and vague.

## Palette

Pale linden green for the page, a dried-sage tile behind every product photo, a deep green ink for text, and one accent: mallow (*mauve*), the colour named after one of the farm’s own flowers. The accent is used only for buttons, links and focus, never for large areas (direction "B's structure with A's restraint" in `docs/design/visual-references.md`).

| Theme key | Value | Role |
|---|---|---|
| `primary` | `#7A3B6E` | mallow: buttons, links, focus ring, selected states |
| `primaryContrast` | `#FFFFFF` | text and icons on `primary` |
| `background` | `#F0F2EA` | page background, pale linden green |
| `surface` | `#E0E6D5` | product photo tiles, footer, quote bands, inputs |
| `text` | `#1E2A20` | body text and headings, deep green ink; also the logo colour |
| `muted` | `#52604F` | secondary text: product descriptors, captions, labels, metadata |

### Contrast (WCAG 2.x relative luminance)

Computed with the WCAG formula on the hex values above. All pairs reach AA for body text (4.5:1).

| Foreground | Background | Ratio | AA (4.5:1) |
|---|---|---|---|
| `text` #1E2A20 | `background` #F0F2EA | 13.21:1 | pass |
| `text` #1E2A20 | `surface` #E0E6D5 | 11.69:1 | pass |
| `muted` #52604F | `background` #F0F2EA | 5.91:1 | pass |
| `muted` #52604F | `surface` #E0E6D5 | 5.23:1 | pass |
| `primaryContrast` #FFFFFF | `primary` #7A3B6E | 7.84:1 | pass |
| `primary` #7A3B6E (links) | `background` #F0F2EA | 6.94:1 | pass |
| `primary` #7A3B6E (links) | `surface` #E0E6D5 | 6.14:1 | pass |

`surface` against `background` is only 1.13:1, on purpose: tiles are a quiet tint, not a box. Edges that matter (cards, inputs, steppers) need a hairline border, for example `text` at about 15% opacity, and input borders must reach 3:1 against their background.

For `light.config.ts`:

```ts
colors: {
  primary: '#7A3B6E',
  primaryContrast: '#FFFFFF',
  background: '#F0F2EA',
  surface: '#E0E6D5',
  text: '#1E2A20',
  muted: '#52604F',
},
```

## Fonts

Two families from Google Fonts, both under the SIL Open Font License 1.1, both self-hostable (for example with `next/font/google`, which downloads them at build time and serves them from the app).

| Role | Family (exact name) | Weights and styles used | Licence |
|---|---|---|---|
| Headings, product names, quotes, logo | **Spectral** (Production Type, Paris) | 300 Light, 300 Light Italic, 400 Regular, 500 Medium | OFL 1.1 |
| Body, UI, buttons, forms, prices | **Source Sans 3** (Adobe) | 400 Regular, 600 SemiBold | OFL 1.1 |

```ts
fonts: { heading: 'Spectral', body: 'Source Sans 3' },
```

Fallback stacks: `Spectral, Georgia, 'Times New Roman', serif` and `'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif`.

How they are used:

- **Large headings (h1, h2) in Spectral Light 300**, big and quiet, tight line height (about 1.1). The size of the type sets the hierarchy, not colour or weight.
- **Small headings (h3), product names and the wordmark in Spectral 400–500.**
- **Pull quotes in Spectral Light Italic**, with the sign-off in Source Sans 3, `muted`.
- **Everything else in Source Sans 3 400**, 17–18 px for body copy, line height about 1.55, lines under 75 characters. SemiBold 600 only for buttons and prices. Prices use tabular figures (`font-variant-numeric: tabular-nums`).
- No all-caps labels and no tracked-out eyebrows. Labels are sentence case in `muted`.

## Logo

- `images/logo.svg`: horizontal lockup, the mark followed by the wordmark "Les Claies" in Spectral Regular, outlined to paths (no font needed). One colour, `text` #1E2A20. Use it in the header and the footer; it links to the home page. Minimum height 24 px.
- `images/logo-mark.svg`: the square mark alone, for the favicon and small square spots.
- The mark is a leaf laid on a drying rack, the thing the farm is named after.
- Both files have a `viewBox` and no fixed width or height, so they scale to whatever size the theme gives them. Keep clear space around the logo equal to half the mark’s height.
- On a `primary` or photo background, use the wordmark in white or leave it out. Don't recolour it in `primary`.

## Photography

- **Products:** square photos (1200 × 1200) of the plant or the dried tea, always shown on a `surface` tile with padding of about 8 % on every side, so photos taken in different light still read as one set.
- **Heroes:** 16:10 landscapes, places and hands rather than posed people. When text sits on a photo, put a scrim under it.
- **Image + text:** 4:5 portrait crops, with a short place or date caption in `muted`.
- Photos are CC0 (see `images/CREDITS.md`). They show real places and plants, not the fictional farm.

## Site facts (all fictional)

For the footer, the contact page and the theme. These are the only addresses and numbers the content uses.

| | FR | EN |
|---|---|---|
| Address | Les Claies, quartier de Combe-Rousse, 26510 Montaurel (Drôme) | same, followed by "France" |
| Email | `bonjour@lesclaies.example` (the `.example` domain is reserved, so mail can never reach anyone) | |
| Phone | 04 65 71 23 48 (in the 04 65 71 range ARCEP reserves for fiction) | +33 4 65 71 23 48 |
| Phone hours | du lundi au vendredi, de 14 h à 17 h | Monday to Friday, 2 pm to 5 pm |
| Farm visits | le samedi de 9 h à 12 h, de mai à septembre, sur rendez-vous la veille | Saturdays 9 am to noon, May to September, booked the day before |
| Shipping days | mardi et vendredi | Tuesdays and Fridays |
| Company numbers | SIRET, VAT: "fictif" | "fictional" |

If `site.contactEmail` in `light.config.ts` is set to something else, the config wins for anything the app sends or shows itself; the email written in the contact page copy stays `bonjour@lesclaies.example`.

## Suggested `light.config.ts` values

The demo's config belongs to S22/S23, not to this folder; these are the values the content was written for.

```ts
site: { name: 'Les Claies', url: 'https://lightcommerce.fluxory.dev', indexable: false, contactEmail: 'bonjour@lesclaies.example' },
locales: { available: ['fr', 'en'], default: 'fr' },
theme: { colors: { /* see Palette */ }, fonts: { heading: 'Spectral', body: 'Source Sans 3' }, logo: '<path under public/ to logo.svg>' },
shop: { currency: 'EUR', pricesIncludeTax: true, displayTaxRate: 5.5, shipping: { flatRate: 490, countries: ['FR'] } },
```

`displayTaxRate` is 5.5 because herbal teas are food in France (reduced VAT rate). If the config schema only accepts whole numbers, that schema needs a change, not this value.

## Demo notice

The legal page says plainly that the site is a demo. The theme may also show a one-line notice bar. Suggested wording, for `messages/{fr,en}.json` if S22 adds one:

- FR: Site de démonstration : rien n’est vendu ni expédié. Carte de test : 4242 4242 4242 4242.
- EN: Demo site: nothing is sold or shipped. Test card: 4242 4242 4242 4242.
