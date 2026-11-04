import { describe, expect, it, vi } from 'vitest'

import { getLightConfig } from '@/config'
import { emailAdapter } from '@/core/email'
import { missingSmtpProblem, readSmtpSettings, safeSenderName, SMTP_TIMEOUT_MS, smtpTransportOptions } from '@/core/email/smtp'
import { stopIfSmtpIsMissing } from '@/core/email/startup'

const { fromName, fromAddress } = getLightConfig().email

const fakePayload = { logger: { info: vi.fn() } } as never
const initialise = async (opts: Parameters<typeof emailAdapter>[0]) => (await emailAdapter(opts))({ payload: fakePayload })

describe('email sender and transport', () => {
  it('sends from the name and address in light.config.ts, through the given transport', async () => {
    const sendMail = vi.fn().mockResolvedValue({})
    const adapter = await initialise({ config: getLightConfig(), env: {}, transport: { sendMail } as never })
    expect(adapter.defaultFromName).toBe(fromName)
    expect(adapter.defaultFromAddress).toBe(fromAddress)
    await adapter.sendEmail({ to: 'a@b.test', subject: 'Hi', text: 'Hello' })
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: `${fromName} <${fromAddress}>`, to: 'a@b.test' }))
  })

  it('keeps a name with a comma or quote from breaking the From header', async () => {
    const sendMail = vi.fn().mockResolvedValue({})
    const base = getLightConfig()
    const config = { ...base, email: { ...base.email, fromName: 'Tea, Herbs & "Co" <x>\r\nBcc: a@b.test' } }
    const adapter = await initialise({ config, env: {}, transport: { sendMail } as never })
    await adapter.sendEmail({ to: 'a@b.test', subject: 'Hi', text: 'Hello' })
    const from = sendMail.mock.calls[0]![0].from as string
    expect(from).toBe(`Tea Herbs & Co x Bcc a@b.test <${fromAddress}>`)
    expect(from).not.toMatch(/[\r\n]/)
    expect(safeSenderName('A "B"')).toBe('A B')
  })

  it('uses SMTP when SMTP_HOST is set', async () => {
    const adapter = await initialise({ config: getLightConfig(), env: { SMTP_HOST: 'mailpit', SMTP_PORT: '1025' } })
    expect(adapter.name).toBe('nodemailer')
  })

  it('logs the email instead of failing when SMTP_HOST is not set: who it was for and its subject, never its body', async () => {
    const info = vi.fn()
    const adapter = (await emailAdapter({ config: getLightConfig(), env: {} }))({ payload: { logger: { info } } as never })
    expect(adapter.name).toBe('log')
    const body = 'Your order: https://shop.example/en/order/1?token=secret-token'
    await expect(adapter.sendEmail({ to: 'a@b.test', subject: 'Hi', text: body, html: `<p>${body}</p>` })).resolves.toBeUndefined()
    expect(info).toHaveBeenCalledTimes(1)
    const logged = info.mock.calls[0]![0] as string
    expect(logged).toContain('a@b.test')
    expect(logged).toContain('"Hi"')
    expect(logged).not.toContain('secret-token')
    expect(logged).not.toContain('Your order')
  })

  it('gives up on a slow mail server after 10 seconds at each step, well inside Docker’s stop grace', () => {
    expect(SMTP_TIMEOUT_MS).toBe(10_000)
    expect(smtpTransportOptions({ host: 'mailpit', port: 1025 })).toEqual({
      host: 'mailpit',
      port: 1025,
      secure: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    })
    expect(smtpTransportOptions({ host: 'smtp.example', port: 465, auth: { user: 'u', pass: 'p' } })).toMatchObject({ secure: true, auth: { user: 'u', pass: 'p' } })
  })
})

describe('SMTP settings', () => {
  it('reads host, port and login', () => {
    expect(readSmtpSettings({ SMTP_HOST: 'h', SMTP_PORT: '2525', SMTP_USER: 'u', SMTP_PASS: 'p' })).toEqual({
      host: 'h',
      port: 2525,
      auth: { user: 'u', pass: 'p' },
    })
    expect(readSmtpSettings({ SMTP_HOST: 'h', SMTP_PORT: '1025' })?.auth).toBeUndefined()
  })

  it('rejects a user without a password, and the other way round', () => {
    expect(() => readSmtpSettings({ SMTP_HOST: 'h', SMTP_USER: 'u' })).toThrow(/SMTP_PASS is missing/)
    expect(() => readSmtpSettings({ SMTP_HOST: 'h', SMTP_PASS: 'p' })).toThrow(/SMTP_USER is missing/)
  })

  it('returns null without a host, and rejects a bad port', () => {
    expect(readSmtpSettings({ SMTP_PORT: '1025' })).toBeNull()
    expect(() => readSmtpSettings({ SMTP_HOST: 'h', SMTP_PORT: 'abc' })).toThrow(/SMTP_PORT/)
  })
})

describe('production check', () => {
  it('reports a missing SMTP_HOST in production only', () => {
    expect(missingSmtpProblem({ NODE_ENV: 'production' })).toMatch(/SMTP_HOST is not set/)
    expect(missingSmtpProblem({ NODE_ENV: 'production', SMTP_HOST: 'mailpit' })).toBeNull()
    expect(missingSmtpProblem({ NODE_ENV: 'development' })).toBeNull()
    expect(missingSmtpProblem({ NODE_ENV: 'test' })).toBeNull()
  })

  it('stops startup with a clear message', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    stopIfSmtpIsMissing({ NODE_ENV: 'production' })
    expect(exit).toHaveBeenCalledWith(1)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('SMTP_HOST'))
    exit.mockClear()
    stopIfSmtpIsMissing({ NODE_ENV: 'production', SMTP_HOST: 'x' })
    expect(exit).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
