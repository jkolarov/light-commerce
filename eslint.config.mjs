import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

// Imports that cross module boundaries: `@/modules/<name>/...`, or relative paths that climb
// out to `../<name>` or `../modules/<name>`.
const moduleImport = (name) => `^(?:@/modules/${name}|(?:\\.\\./)+(?:modules/)?${name})(?:/|$)`

const pattern = (regex, message) => ({ regex, message })

// `no-restricted-imports` takes one list of patterns per file. Flat config gives a file the options
// of the LAST block that matches it, so every block below lists all the patterns its files need:
// a block that redeclared the rule with only its own pattern would drop the others for its files.
const forbid = (...patterns) => ['error', { patterns }]

const cmsToShop = pattern(
  moduleImport('shop'),
  'The cms module must not import from the shop module. Connect through the Payload config instead.',
)
const shopToCms = pattern(
  moduleImport('cms'),
  'The shop module must not import from the cms module. Connect through the Payload config instead.',
)
const coreToModules = pattern(
  `^(?:@/modules|(?:\\.\\./)+modules)(?:/|$)`,
  'Core must not import from a module: modules plug into core, not the other way round.',
)
// Stripe's SDKs, and the ecommerce plugin's Stripe adapter that calls them, only in the shop's
// Stripe folder (design 4.8): everything else reaches Stripe through that folder's exports.
const stripeSdk = pattern(
  '^(?:stripe|@stripe/[^/]+|@payloadcms/plugin-ecommerce/payments/stripe)(?:/.*)?$',
  'Only src/modules/shop/payments/stripe/ talks to Stripe. Use that folder\'s exports instead.',
)

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Every file: no Stripe outside its folder. The blocks below repeat it next to their own rules.
    rules: { 'no-restricted-imports': forbid(stripeSdk) },
  },
  {
    // Modules never import each other: they connect through the Payload config and hooks.
    files: ['src/modules/cms/**'],
    rules: { 'no-restricted-imports': forbid(cmsToShop, stripeSdk) },
  },
  {
    files: ['src/modules/shop/**'],
    rules: { 'no-restricted-imports': forbid(shopToCms, stripeSdk) },
  },
  {
    // The one folder that talks to Stripe. Still part of the shop: no cms imports.
    files: ['src/modules/shop/payments/stripe/**'],
    rules: { 'no-restricted-imports': forbid(shopToCms) },
  },
  {
    // Core works with every module switched off, so it never imports a module.
    files: ['src/core/**', 'src/config/**'],
    rules: { 'no-restricted-imports': forbid(coreToModules, stripeSdk) },
  },
  {
    // Generated files: regenerate them with `pnpm generate`, never edit or lint them. Migrations
    // are written by `pnpm payload migrate:create` (src/migrations/index.ts too).
    ignores: [
      '.next/',
      'next-env.d.ts',
      'src/payload-types.ts',
      'src/app/(payload)/admin/importMap.js',
      'src/migrations/',
    ],
  },
]

export default eslintConfig
