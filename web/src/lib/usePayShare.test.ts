import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { payShare } from './api'
import { usePayShare } from './usePayShare'

vi.mock('./api', () => ({ payShare: vi.fn() }))
const share = {
  id: 'share',
  memberId: 'member',
  amountCents: 334,
  paidAt: '2026-11-09T00:00:00.000Z',
}

function pending<T>() {
  let finish: (value: T) => void = () => {
    throw new Error('promise is not ready')
  }
  const promise = new Promise<T>((resolve) => {
    finish = resolve
  })
  return { promise, finish: (value: T) => finish(value) }
}

beforeEach(() => {
  vi.mocked(payShare).mockReset()
  vi.mocked(payShare).mockResolvedValue({ ok: true, data: share })
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('usePayShare', () => {
  it('keeps a timed-out share unpaid and reuses its key until success', async () => {
    vi.mocked(payShare).mockResolvedValueOnce({
      ok: false,
      message: 'the server took too long to answer',
    })
    const settled = vi.fn()
    const uuid = vi.spyOn(crypto, 'randomUUID')
    const { result } = renderHook(() => usePayShare(settled))
    expect(result.current.stateOf('share')).toEqual({ status: 'idle' })
    await act(async () => {
      await result.current.pay('bill', 'share')
    })
    expect(result.current.stateOf('share')).toEqual({
      status: 'failed',
      message: 'the server took too long to answer',
    })
    expect(settled).not.toHaveBeenCalled()
    const key = vi.mocked(payShare).mock.calls[0]?.[2]
    expect(key).toEqual(expect.any(String))

    await act(async () => {
      await result.current.pay('bill', 'share')
    })
    expect(vi.mocked(payShare).mock.calls[1]).toEqual(['bill', 'share', key])
    expect(result.current.stateOf('share')).toEqual({ status: 'idle' })
    expect(settled).toHaveBeenCalledTimes(1)
    expect(uuid).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.pay('bill', 'share')
    })
    expect(vi.mocked(payShare).mock.calls[2]?.[2]).not.toBe(key)
    expect(uuid).toHaveBeenCalledTimes(2)
    expect(settled).toHaveBeenCalledTimes(2)
  })

  it.each([
    { message: 'could not reach the server', status: undefined },
    { message: 'the server had a problem, try again', status: 500 },
  ])('keeps the key after $message', async (failure) => {
    vi.mocked(payShare).mockResolvedValue({ ok: false, ...failure })
    const settled = vi.fn()
    const { result } = renderHook(() => usePayShare(settled))
    await act(async () => {
      await result.current.pay('bill', 'share')
    })
    expect(result.current.stateOf('share')).toEqual({ status: 'failed', message: failure.message })
    await act(async () => {
      await result.current.pay('bill', 'share')
    })
    expect(payShare).toHaveBeenCalledTimes(2)
    expect(vi.mocked(payShare).mock.calls[1]).toEqual(vi.mocked(payShare).mock.calls[0])
    expect(settled).not.toHaveBeenCalled()
  })

  it.each([
    { status: 409, message: 'already paid' },
    { status: 404, message: 'this share no longer exists' },
  ])('clears the key and reloads on $status', async ({ status, message }) => {
    vi.mocked(payShare).mockResolvedValue({ ok: false, message: 'API error', status })
    const settled = vi.fn()
    const { result } = renderHook(() => usePayShare(settled))
    await act(async () => {
      await result.current.pay('bill', 'share')
    })
    expect(result.current.stateOf('share')).toEqual({ status: 'failed', message })
    expect(settled).toHaveBeenCalledTimes(1)
    const firstKey = vi.mocked(payShare).mock.calls[0]?.[2]
    await act(async () => {
      await result.current.pay('bill', 'share')
    })
    expect(vi.mocked(payShare).mock.calls[1]?.[2]).not.toBe(firstKey)
  })

  it('sends one request when a share is clicked twice while paying', async () => {
    const waiting = pending<Awaited<ReturnType<typeof payShare>>>()
    vi.mocked(payShare).mockReturnValue(waiting.promise)
    const settled = vi.fn()
    const { result } = renderHook(() => usePayShare(settled))
    act(() => {
      void result.current.pay('bill', 'share')
      void result.current.pay('bill', 'share')
    })
    expect(result.current.stateOf('share')).toEqual({ status: 'paying' })
    expect(payShare).toHaveBeenCalledTimes(1)
    await act(async () => {
      waiting.finish({ ok: true, data: share })
    })
    expect(result.current.stateOf('share')).toEqual({ status: 'idle' })
    expect(settled).toHaveBeenCalledTimes(1)
  })

  it('pays different shares independently with different keys', async () => {
    const first = pending<Awaited<ReturnType<typeof payShare>>>()
    const second = pending<Awaited<ReturnType<typeof payShare>>>()
    vi.mocked(payShare).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const settled = vi.fn()
    const { result } = renderHook(() => usePayShare(settled))
    act(() => {
      void result.current.pay('bill', 'first')
      void result.current.pay('bill', 'second')
    })
    expect(payShare).toHaveBeenCalledTimes(2)
    expect(vi.mocked(payShare).mock.calls[0]?.[2]).not.toBe(vi.mocked(payShare).mock.calls[1]?.[2])
    expect(result.current.stateOf('first')).toEqual({ status: 'paying' })
    expect(result.current.stateOf('second')).toEqual({ status: 'paying' })
    await act(async () => {
      first.finish({ ok: true, data: { ...share, id: 'first' } })
    })
    expect(result.current.stateOf('first')).toEqual({ status: 'idle' })
    expect(result.current.stateOf('second')).toEqual({ status: 'paying' })
    await act(async () => {
      second.finish({ ok: true, data: { ...share, id: 'second' } })
    })
    expect(result.current.stateOf('second')).toEqual({ status: 'idle' })
    expect(settled).toHaveBeenCalledTimes(2)
  })
})
