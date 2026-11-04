import { APIError, type CollectionBeforeDeleteHook, type PayloadRequest } from 'payload'

// What can't be deleted for good while a payment or an order needs it (plan, "Orders"):
//
// - a product that an order bought, or that a payment still being settled is for: the database
//   would empty the lines that point to it, so a past order would lose its line, and a payment
//   settled afterwards would make an order with no lines and never take its stock;
// - a cart that a payment not settled yet is for: the plugin settles a payment from its cart, so
//   the payment would be paid at Stripe and never become an order. That includes a payment the
//   reconcile job closed as `expired` or `failed`: if Stripe is paid for it after all (a checkout
//   tab left open, a night with the wrong Stripe key), `finalizePayment` reopens it and settles it
//   from that cart. (A guest can delete their own cart with its secret.)
//
// Moving a product to the trash still works: it keeps its row. This guards deletes made by a
// person, in the admin or over the REST API. Scripts on the server (the seed's `--force` wipe,
// S26's nightly reset) delete without a user and delete the orders too, so they are not stopped.

/** Whether a delete comes from a person (the admin, the REST API), not from a script on the server. */
const byPerson = (req: PayloadRequest) => Boolean(req.user) || req.payloadAPI !== 'local'

const UNSETTLED = ['pending', 'processing']
/** Not settled, and still settleable: reopened by `finalizePayment` when Stripe was paid after all. */
const NOT_SETTLED = [...UNSETTLED, 'expired', 'failed']

export const keepProductsOfOrders: CollectionBeforeDeleteHook = async ({ req, id }) => {
  if (!byPerson(req)) return
  const [orders, payments] = await Promise.all([
    req.payload.count({ collection: 'orders', where: { 'items.product': { equals: id } }, overrideAccess: true, req }),
    req.payload.count({ collection: 'transactions', where: { and: [{ 'items.product': { equals: id } }, { status: { in: UNSETTLED } }] }, overrideAccess: true, req }),
  ])
  if (orders.totalDocs || payments.totalDocs) {
    throw new APIError('This product is in orders or in a payment being settled: it can’t be deleted for good. Move it to the trash instead.', 400)
  }
}

export const keepCartsOfPayments: CollectionBeforeDeleteHook = async ({ req, id }) => {
  if (!byPerson(req)) return
  const payments = await req.payload.count({ collection: 'transactions', where: { and: [{ cart: { equals: id } }, { status: { in: NOT_SETTLED } }] }, overrideAccess: true, req })
  if (payments.totalDocs) throw new APIError('This cart has a payment that isn’t settled: it can’t be deleted yet.', 400)
}
