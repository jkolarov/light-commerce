// The site's logo on the admin's login page (`admin.components.graphics.Logo` in admin.ts).
// A server component without Next.js imports, like every admin component in Payload 4.

type Props = {
  /** `theme.logo` from light.config.ts: a path under public/. */
  src: string
  /** `site.name` from light.config.ts. */
  alt: string
}

export function AdminLogo({ src, alt }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- admin components must not import next/image
    <img src={src} alt={alt} style={{ display: 'block', width: '100%', maxWidth: 240, height: 'auto' }} />
  )
}
