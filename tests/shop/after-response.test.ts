import { beforeEach, expect, it, vi } from 'vitest'

import { describeWithShop } from '../support/modules'

// `afterResponse` (src/modules/shop/emails/afterResponse.ts): Next's `after` during a request; the
// task in place anywhere else. Outside a request is the normal case in scripts and tests, so it
// is quiet; any other reason `after` refuses is worth a warning, and the task still runs.

const next = vi.hoisted(() => ({ after: vi.fn<(task: () => Promise<void>) => void>() }))
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), after: (task: () => Promise<void>) => next.after(task) }))

describeWithShop('running a task after the response', () => {
  let afterResponse: typeof import('@/modules/shop/emails/afterResponse').afterResponse
  const logger = { warn: vi.fn() }

  beforeEach(async () => {
    ;({ afterResponse } = await import('@/modules/shop/emails/afterResponse'))
    next.after.mockReset()
    logger.warn.mockReset()
  })

  it('hands the task to Next during a request, and does not run it now', async () => {
    const task = vi.fn(async () => {})
    await afterResponse(task, logger)
    expect(next.after).toHaveBeenCalledWith(task)
    expect(task).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('runs the task now, quietly, outside a request', async () => {
    next.after.mockImplementation(() => {
      throw new Error('`after` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context')
    })
    const task = vi.fn(async () => {})
    await afterResponse(task, logger)
    expect(task).toHaveBeenCalledTimes(1)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('warns when Next refuses for another reason, and still runs the task now', async () => {
    next.after.mockImplementation(() => {
      throw new Error('`after` cannot be called inside "use cache"')
    })
    const task = vi.fn(async () => {})
    await afterResponse(task, logger)
    expect(task).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledTimes(1)
    const [warning] = logger.warn.mock.calls[0] as [{ err: Error; msg: string }]
    expect(warning.err.message).toContain('use cache')
  })
})
