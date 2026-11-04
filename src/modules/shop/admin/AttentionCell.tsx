import type { DefaultServerCellComponentProps } from 'payload'

// The orders list's "Needs attention" column (`orders.needsAttention`, collections/Orders.ts): a
// badge on the orders that need the owner, nothing on the others, instead of a plain true/false.
// A server component, like every admin component here.

const label = { fr: 'À vérifier', en: 'Needs attention' }

/** The badge's style, from Payload's own warning colours (with fallbacks). */
export const attentionBadgeStyle = {
  display: 'inline-block',
  padding: '0.125rem 0.5rem',
  borderRadius: '999px',
  fontSize: '0.8125rem',
  fontWeight: 600,
  lineHeight: 1.5,
  whiteSpace: 'nowrap',
  background: 'var(--color-bg-warning-tertiary, #fdecc8)',
  color: 'var(--color-text-warning, #6a3d00)',
} as const

export const attentionLabel = (language: string | undefined) => (language === 'fr' ? label.fr : label.en)

export function AttentionCell({ cellData, i18n }: Pick<DefaultServerCellComponentProps, 'cellData' | 'i18n'>) {
  if (cellData !== true) return null
  return <span style={attentionBadgeStyle}>{attentionLabel(i18n?.language)}</span>
}
