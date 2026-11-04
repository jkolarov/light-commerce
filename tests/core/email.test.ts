import { describe, expect, it, vi } from 'vitest'

import { getLightConfig } from '@/config'
import { emailAdapter } from '@/core/email'
import { missingSmtpProblem, readSmtpSettings, safeSenderName } from '@/core/email/smtp'
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

  it('logs the email instead of failing when SMTP_HOST is not set', async () => {
    const info = vi.fn()
    const adapter = (await emailAdapter({ config: getLightConfig(), env: {} }))({ payload: { logger: { info } } as never })
    expect(adapter.name).toBe('log')
    await expect(adapter.sendEmail({ to: 'a@b.test', subject: 'Hi', text: 'Hello' })).resolves.toBeUndefined()
    expect(info).toHaveBeenCalledWith(expect.stringContaining('a@b.test'))
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
