import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// next-intl's request config. A path string only: this file imports nothing from src/.
const withNextIntl = createNextIntlPlugin('./src/core/i18n/request.ts')

const nextConfig: NextConfig = {
  // Next.js 16.4's `next dev` writes into AGENTS.md unless this is off.
  agentRules: false,
  // The Docker image (S08) runs the standalone server from `.next/standalone`.
  output: 'standalone',
  // The standalone trace drops `strtok3/lib/index.js` (file-type, used by Payload's upload and file
  // serving, imports it in a way the tracer misses), so every /api/media/file/* answers 500 in the
  // image. Copy the whole package into the output. pnpm keeps it under .pnpm/strtok3@<version>.
  outputFileTracingIncludes: {
    '/**': ['./node_modules/.pnpm/strtok3@*/node_modules/strtok3/**/*'],
  },
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(withNextIntl(nextConfig), { devBundleServerPackages: false })
