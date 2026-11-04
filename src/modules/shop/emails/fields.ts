import type { Field } from 'payload'

const nobody = () => false

/**
 * `orders.confirmationEmailSentAt`: when the order's emails went out (the buyer's confirmation and
 * the owner's notification), or empty until then. The sender claims an order by setting it with
 * one conditional update (./send.ts), so the emails go out once per order. Nobody edits it.
 */
export const confirmationEmailSentAtField = (): Field => ({
  name: 'confirmationEmailSentAt',
  type: 'date',
  label: { en: 'Order emails sent', fr: 'E-mails de commande envoyés' },
  access: { update: nobody },
  admin: {
    readOnly: true,
    position: 'sidebar',
    date: { pickerAppearance: 'dayAndTime' },
    description: {
      en: 'When the confirmation went to the buyer, and the notification to you. If sending failed, the order needs attention.',
      fr: 'Quand la confirmation est partie chez l’acheteur, et la notification chez vous. Si l’envoi a échoué, la commande est à vérifier.',
    },
  },
})
