import { afterEach, describe, expect, it, vi } from 'vitest'
import { addMember, createBill, createHome, getBills, getHome, payShare } from './api'

const member = { id: 'member', homeId: 'home', name: 'Asha' }
const home = { id: 'home', name: 'Flat', members: [member] }
const share = { id: 'share', memberId: 'member', amountCents: 334, paidAt: null }
const bill = { id: 'bill', homeId: 'home', title: 'Rent', totalCents: 334, shares: [share] }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('api client', () => {
  it('validates successful responses for each endpoint', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(home))
      .mockResolvedValueOnce(Response.json({ bills: [bill] }))
      .mockResolvedValueOnce(Response.json({ id: 'home', name: 'Flat' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json(member, { status: 201 }))
      .mockResolvedValueOnce(Response.json(bill, { status: 201 }))
    vi.stubGlobal('fetch', fetch)
    await expect(getHome('home')).resolves.toEqual({ ok: true, data: home })
    await expect(getBills('home')).resolves.toEqual({ ok: true, data: [bill] })
    await expect(createHome('Flat')).resolves.toEqual({
      ok: true,
      data: { id: 'home', name: 'Flat' },
    })
    await expect(addMember('home', 'Asha')).resolves.toEqual({ ok: true, data: member })
    await expect(createBill('home', 'Rent', 334)).resolves.toEqual({ ok: true, data: bill })
    expect(fetch.mock.calls[2]?.[1]).toMatchObject({ method: 'POST', body: '{"name":"Flat"}' })
    expect(fetch.mock.calls[3]?.[1]).toMatchObject({ method: 'POST', body: '{"name":"Asha"}' })
    expect(fetch.mock.calls[4]?.[1]).toMatchObject({
      method: 'POST',
      body: '{"title":"Rent","totalCents":334}',
    })
  })

  it.each([404, 409])('keeps status %s and the API error message', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'resource unavailable' }, { status })),
    )
    await expect(getHome('home')).resolves.toEqual({
      ok: false,
      message: 'resource unavailable',
      status,
    })
  })

  it.each(['<html>crashed</html>', ''])('explains a 500 with an unusable body %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 500 })))
    await expect(getHome('home')).resolves.toEqual({
      ok: false,
      message: 'the server had a problem, try again',
      status: 500,
    })
  })

  it.each([
    'not JSON',
    JSON.stringify({ id: 'home' }),
    JSON.stringify({ ...home, members: [{ ...member, name: 1 }] }),
  ])('rejects an unexpected success body %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)))
    await expect(getHome('home')).resolves.toEqual({
      ok: false,
      message: 'the server sent an unexpected response',
      status: 200,
    })
  })

  it('rejects a bill with malformed nested shares', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ bills: [{ ...bill, shares: [{ ...share, amountCents: 10.5 }] }] }),
        ),
    )
    await expect(getBills('home')).resolves.toEqual({
      ok: false,
      message: 'the server sent an unexpected response',
      status: 200,
    })
  })

  it('resolves when fetch rejects with a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('connection lost')))
    await expect(getHome('home')).resolves.toEqual({
      ok: false,
      message: 'could not reach the server',
    })
  })

  it('resolves when reading the response body fails', async () => {
    const response = Response.json(home)
    vi.spyOn(response, 'text').mockRejectedValue(new TypeError('stream closed'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(getHome('home')).resolves.toEqual({
      ok: false,
      message: 'could not reach the server',
      status: 200,
    })
  })

  it.each([undefined, 25])('aborts a slow fetch with timeout %s', async (timeoutMs) => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            )
          }),
      ),
    )
    const pending = getHome('home', timeoutMs)
    await vi.advanceTimersByTimeAsync(timeoutMs ?? 10000)
    await expect(pending).resolves.toEqual({
      ok: false,
      message: 'the server took too long to answer',
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('encodes ids and sends the payment key with POST', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(home))
      .mockResolvedValueOnce(Response.json({ ...share, paidAt: '2026-11-09T00:00:00.000Z' }))
    vi.stubGlobal('fetch', fetch)
    await getHome('flat /?#घर')
    const paid = await payShare('bill/a', 'share ?#', 'stable-key')
    expect(paid.ok).toBe(true)
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/homes/${encodeURIComponent('flat /?#घर')}`)
    expect(fetch.mock.calls[1]?.[0]).toBe(
      `/api/bills/${encodeURIComponent('bill/a')}/shares/${encodeURIComponent('share ?#')}/pay`,
    )
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'Idempotency-Key': 'stable-key' },
    })
  })
})
