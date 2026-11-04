import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { defineLightConfig } from '@/config'
import { adminConfig } from '@/core/admin'
import { AdminLogo } from '@/core/AdminLogo'

import { validInput } from '../config/fixtures/validInput'

const config = defineLightConfig(validInput())

describe('admin branding from light.config.ts', () => {
  it('puts the site name in the title of every admin page', () => {
    expect(adminConfig({ config }).meta.titleSuffix).toBe('- Example shop')
  })

  it('shows the logo from theme.logo on the login page', () => {
    expect(adminConfig({ config }).components.graphics.Logo).toEqual({
      path: '/core/AdminLogo#AdminLogo',
      clientProps: { src: '/logo.svg', alt: 'Example shop' },
    })
  })

  it('renders the logo as an image named after the site', () => {
    const html = renderToStaticMarkup(createElement(AdminLogo, { src: '/logo.svg', alt: 'Example shop' }))
    expect(html).toMatch(/<img [^>]*src="\/logo\.svg"/)
    expect(html).toContain('alt="Example shop"')
  })
})
