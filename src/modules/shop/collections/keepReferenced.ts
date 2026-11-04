import { APIError, type CollectionBeforeDeleteHook, type PayloadRequest } from 'payload'

// What can't be deleted for good while a payment or an order needs it (plan, "Orders"):
//
// - a product that an order bought, or that a payment still being settled is for: the database
//   would empty the lines that point to it, so a past order would lose its line, and a payment
//   settled afterwards would make an order with no lines and never take its stock;
// - a cart that a payment still being settled is for: the plugin settles a payment from its
//   cart, so the payment would be paid at Stripe and never become an order. (A guest can delete
//   their own cart with its secret.)
//
// Moving a product to the trash still works: it keeps its row. This guards deletes made by a
// person, in the admin or over the REST API. Scripts on the server (the seed's `--force` wipe,
// S26's nightly reset) delete without a user and delete the orders too, so they are not stopped.

/** Whether a delete comes from a person (the admin, the REST API), not from a script on the server. */
const byPerson = (req: PayloadRequest) => Boolean(req.user) || req.payloadAPI !== 'local'

const UNSETTLED = ['pending', 'processing']

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
  const payments = await req.payload.count({ collection: 'transactions', where: { and: [{ cart: { equals: id } }, { status: { in: UNSETTLED } }] }, overrideAccess: true, req })
  if (payments.totalDocs) throw new APIError('This cart has a payment being settled: it can’t be deleted yet.', 400)
}
