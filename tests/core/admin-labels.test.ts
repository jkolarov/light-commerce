import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { startPayload, type TestPayload } from '../support/payload'

// Everything the shop, the CMS and core add to the admin is labelled in French and English. The
// plugin's own fields carry labels from its translations (functions), so only a plain string
// (English only) or a label object missing a language fails here. Runs in every setup: it checks
// whichever of these collections and globals the setup has.

const OURS_COLLECTIONS = ['users', 'media', 'pages', 'products', 'orders', 'transactions']
const OURS_GLOBALS = ['header', 'footer']
// Written by Payload or a plugin whose own UI translates them.
const SKIP = new Set(['blockName', 'meta', 'id', 'createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy', '_status'])
const AUTH_FIELDS = new Set(['resetPasswordToken', 'resetPasswordExpiration', 'salt', 'hash', 'resetPasswordRequestedAt', 'loginAttempts', 'lockUntil', 'sessions'])

type AnyField = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** A label that is a function (translated by a plugin) or has both languages. */
function complete(label: unknown): boolean {
  if (typeof label === 'function') return true
  if (!label || typeof label !== 'object') return false
  const { en, fr } = label as { en?: unknown; fr?: unknown }
  return typeof en === 'string' && en !== '' && typeof fr === 'string' && fr !== ''
}

/** Every place that shows text to the admin, as `where: what` for the ones missing a language. */
function missing(where: string, fields: AnyField[], found: string[] = []): string[] {
  for (const field of fields) {
    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        if (tab.label !== undefined && !complete(tab.label)) found.push(`${where}: tab ${String(tab.label)}`)
        missing(where, tab.fields, found)
      }
      continue
    }
    const name: string | undefined = field.name
    if (name && (SKIP.has(name) || AUTH_FIELDS.has(name) || field.admin?.hidden)) continue
    if (name && !complete(field.label)) found.push(`${where}.${name}: label`)
    const description = field.admin?.description
    if (description !== undefined && !complete(description)) found.push(`${where}.${name}: description`)
    // Currency and payment method names ("Euro (EUR)", "Stripe") are the same in both languages.
    const sameInBoth = name === 'currency' || name === 'paymentMethod'
    for (const option of sameInBoth ? [] : (field.options ?? [])) {
      if (typeof option !== 'string' && !complete(option.label)) found.push(`${where}.${name}: option ${option.value}`)
    }
    for (const block of field.blocks ?? []) {
      if (!complete(block.labels?.singular) || !complete(block.labels?.plural)) found.push(`${where}.${name}: block ${block.slug}`)
      missing(`${where}.${block.slug}`, block.fields, found)
    }
    if (field.fields) missing(name ? `${where}.${name}` : where, field.fields, found)
  }
  return found
}

describe('admin labels', () => {
  let test: TestPayload
  let payload: Payload

  beforeAll(async () => {
    test = await startPayload()
    payload = test.payload
  }, 60_000)

  afterAll(async () => {
    await test?.stop()
  })

  it.each(OURS_COLLECTIONS)('%s: collection, fields, options and descriptions in French and English', (slug) => {
    const collection = payload.config.collections.find((c) => c.slug === slug)
    if (!collection) return // this module is off in this setup
    const labels = collection.labels as AnyField
    // The plugin's collections have no `labels` object of their own (their names are translated).
    if (['users', 'media', 'pages'].includes(slug)) {
      expect(complete(labels.singular) && complete(labels.plural), `${slug}: collection labels`).toBe(true)
    }
    expect(missing(slug, collection.fields as AnyField[])).toEqual([])
  })

  it.each(OURS_GLOBALS)('%s: global and fields in French and English', (slug) => {
    const global = payload.config.globals.find((g) => g.slug === slug)
    if (!global) return
    expect(complete(global.label), `${slug}: global label`).toBe(true)
    expect(missing(slug, global.fields as AnyField[])).toEqual([])
  })

  it('names the order statuses in both languages, shipped included', () => {
    const orders = payload.config.collections.find((c) => c.slug === 'orders')
    if (!orders) return
    const status = (orders.fields as AnyField[]).find((f) => f.name === 'status')
    expect(status?.options.map((o: AnyField) => o.value)).toEqual(['processing', 'shipped', 'cancelled', 'refunded'])
    expect(status?.options.every((o: AnyField) => complete(o.label))).toBe(true)
  })
})
