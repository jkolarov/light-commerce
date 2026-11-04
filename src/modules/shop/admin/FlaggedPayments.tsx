import type { BeforeListTableServerProps, Payload } from 'payload'

import { attentionBadgeStyle } from './AttentionCell'

// Above the orders list: the payments that need the owner and have no order to show it on, the
// transactions the reconcile job flagged (`transactions.attentionNote`: paid at Stripe, impossible
// to settle here). Transactions are out of the admin's navigation, so this is where the owner sees
// them, with a link to each one and what to do. Nothing when there are none.

const words = {
  fr: { title: (n: number) => (n === 1 ? 'Un paiement à vérifier' : `${n} paiements à vérifier`), payment: 'Paiement', open: 'Ouvrir' },
  en: { title: (n: number) => (n === 1 ? 'One payment needs attention' : `${n} payments need attention`), payment: 'Payment', open: 'Open' },
}

type Props = Pick<BeforeListTableServerProps, 'i18n' | 'user'> & { payload: Payload }

export async function FlaggedPayments({ payload, i18n, user }: Props) {
  const { docs } = await payload.find({
    collection: 'transactions',
    where: { attentionNote: { exists: true } },
    sort: '-updatedAt',
    limit: 20,
    depth: 0,
    user,
    overrideAccess: false,
  })
  if (!docs.length) return null
  const t = i18n?.language === 'fr' ? words.fr : words.en
  const adminRoute = payload.config.routes.admin
  return (
    <section style={{ margin: '0 0 1.5rem', padding: '1rem 1.25rem', borderRadius: '0.5rem', border: '1px solid var(--color-border-warning, #e8b86b)' }} aria-label={t.title(docs.length)}>
      <p style={{ margin: '0 0 0.75rem' }}>
        <span style={attentionBadgeStyle}>{t.title(docs.length)}</span>
      </p>
      <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
        {docs.map((transaction) => (
          <li key={transaction.id} style={{ marginBottom: '0.5rem' }}>
            <strong>
              {t.payment} {transaction.stripe?.paymentIntentID ?? `#${transaction.id}`}
            </strong>{' '}
            — {transaction.attentionNote}{' '}
            <a href={`${adminRoute}/collections/transactions/${transaction.id}`}>{t.open}</a>
          </li>
        ))}
      </ul>
    </section>
  )
}
