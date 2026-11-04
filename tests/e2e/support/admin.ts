import { type APIRequestContext, expect, type PlaywrightWorkerArgs } from '@playwright/test'

import { e2e } from './env'

// What the shop's owner sees in the admin, read through the same REST API the admin uses, logged
// in as the owner the seed created. Only the fields the test checks are typed.

export type Product = { id: number; slug: string; priceInEUR: number; inventory: number }

export type Order = {
  id: number
  /** Cents: what was charged, `subtotal + shippingAmount`. */
  amount: number
  subtotal: number
  shippingAmount: number
  currency: string
  customerEmail: string
  items: { product: number; quantity: number }[]
  /** Set when something needs the owner, such as stock that ran out after the payment. */
  needsAttention?: boolean | null
}

export type Transaction = {
  id: number
  status: string
  amount: number
  subtotal: number
  shippingAmount: number
  currency: string
  cart: number
  order?: number | null
  customerEmail: string
  stripe: { customerID: string; paymentIntentID: string }
}

type List<T> = { docs: T[]; totalDocs: number }

/** `where[field][equals]=value`, as Payload's REST API reads it. */
const whereEquals = (field: string, value: string) => new URLSearchParams({ [`where[${field}][equals]`]: value, depth: '0', limit: '10' })

export type OwnerApi = {
  product(slug: string): Promise<Product>
  orders(customerEmail: string): Promise<Order[]>
  /** How many orders the shop has, all customers together. */
  orderCount(): Promise<number>
  transactions(customerEmail: string): Promise<Transaction[]>
  dispose(): Promise<void>
}

/** Logs in as the owner and returns what the test reads with that session. */
export async function ownerApi(playwright: PlaywrightWorkerArgs['playwright']): Promise<OwnerApi> {
  const login = await playwright.request.newContext({ baseURL: e2e.baseURL })
  const response = await login.post('/api/users/login', { data: e2e.owner })
  expect(response.status(), 'the owner logs in').toBe(200)
  const { token } = (await response.json()) as { token: string }
  await login.dispose()
  const api: APIRequestContext = await playwright.request.newContext({ baseURL: e2e.baseURL, extraHTTPHeaders: { Authorization: `JWT ${token}` } })

  async function read<T>(collection: string, query: URLSearchParams): Promise<List<T>> {
    const listed = await api.get(`/api/${collection}?${query}`)
    expect(listed.status(), `GET /api/${collection}`).toBe(200)
    return (await listed.json()) as List<T>
  }
  const list = async <T>(collection: string, query: URLSearchParams) => (await read<T>(collection, query)).docs

  return {
    async product(slug) {
      const [product] = await list<Product>('products', whereEquals('slug', slug))
      if (!product) throw new Error(`No product ${slug}: did the seed run?`)
      return product
    },
    orders: (customerEmail) => list<Order>('orders', whereEquals('customerEmail', customerEmail)),
    orderCount: async () => (await read<Order>('orders', new URLSearchParams({ depth: '0', limit: '1' }))).totalDocs,
    transactions: (customerEmail) => list<Transaction>('transactions', whereEquals('customerEmail', customerEmail)),
    dispose: () => api.dispose(),
  }
}
