import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

// Imports that cross module boundaries: `@/modules/<name>/...`, or relative paths that climb
// out to `../<name>` or `../modules/<name>`.
const moduleImport = (name) => `^(?:@/modules/${name}|(?:\\.\\./)+(?:modules/)?${name})(?:/|$)`

const forbid = (regex, message) => ['error', { patterns: [{ regex, message }] }]

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
    // Modules never import each other: they connect through the Payload config and hooks.
    files: ['src/modules/cms/**'],
    rules: {
      'no-restricted-imports': forbid(
        moduleImport('shop'),
        'The cms module must not import from the shop module. Connect through the Payload config instead.',
      ),
    },
  },
  {
    files: ['src/modules/shop/**'],
    rules: {
      'no-restricted-imports': forbid(
        moduleImport('cms'),
        'The shop module must not import from the cms module. Connect through the Payload config instead.',
      ),
    },
  },
  {
    // Core works with every module switched off, so it never imports a module.
    files: ['src/core/**', 'src/config/**'],
    rules: {
      'no-restricted-imports': forbid(
        `^(?:@/modules|(?:\\.\\./)+modules)(?:/|$)`,
        'Core must not import from a module: modules plug into core, not the other way round.',
      ),
    },
  },
  {
    // Generated files: regenerate them with `pnpm generate`, never edit or lint them.
    ignores: [
      '.next/',
      'next-env.d.ts',
      'src/payload-types.ts',
      'src/app/(payload)/admin/importMap.js',
    ],
  },
]

export default eslintConfig
