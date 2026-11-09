import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getBills, getHome } from './api'
import { useHome } from './useHome'

vi.mock('./api', () => ({ getHome: vi.fn(), getBills: vi.fn() }))
const home = { id: 'A', name: 'Flat A', members: [] }

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
  vi.resetAllMocks()
  vi.mocked(getHome).mockResolvedValue({ ok: true, data: home })
  vi.mocked(getBills).mockResolvedValue({ ok: true, data: [] })
})

describe('useHome', () => {
  it('stays idle without a home id', () => {
    const { result } = renderHook(() => useHome(undefined))
    expect(result.current.state).toEqual({ status: 'idle' })
    expect(getHome).not.toHaveBeenCalled()
    expect(getBills).not.toHaveBeenCalled()
  })

  it('loads home and bills together then becomes ready', async () => {
    const waiting = pending<Awaited<ReturnType<typeof getHome>>>()
    vi.mocked(getHome).mockReturnValue(waiting.promise)
    const { result } = renderHook(() => useHome('A'))
    expect(result.current.state).toEqual({ status: 'loading' })
    expect(getHome).toHaveBeenCalledWith('A')
    expect(getBills).toHaveBeenCalledWith('A')
    await act(async () => {
      waiting.finish({ ok: true, data: home })
    })
    expect(result.current.state).toEqual({ status: 'ready', home, bills: [], refreshing: false })
  })

  it('shows an error when bills fail', async () => {
    vi.mocked(getBills).mockResolvedValue({ ok: false, message: 'bills failed', status: 500 })
    const { result } = renderHook(() => useHome('A'))
    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'error',
        message: 'bills failed',
        notFound: false,
      }),
    )
  })

  it('marks a 404 home as not found', async () => {
    vi.mocked(getHome).mockResolvedValue({ ok: false, message: 'home not found', status: 404 })
    const { result } = renderHook(() => useHome('A'))
    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'error',
        message: 'home not found',
        notFound: true,
      }),
    )
  })

  it('does not mark the home missing when only bills return 404', async () => {
    vi.mocked(getBills).mockResolvedValue({ ok: false, message: 'bills missing', status: 404 })
    const { result } = renderHook(() => useHome('A'))
    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'error',
        message: 'bills missing',
        notFound: false,
      }),
    )
  })

  it('keeps old data visible while reloading', async () => {
    const { result } = renderHook(() => useHome('A'))
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    const waiting = pending<Awaited<ReturnType<typeof getHome>>>()
    vi.mocked(getHome).mockReturnValueOnce(waiting.promise)
    act(() => {
      void result.current.reload()
    })
    expect(result.current.state).toEqual({ status: 'ready', home, bills: [], refreshing: true })
    const updated = { ...home, name: 'Updated' }
    await act(async () => {
      waiting.finish({ ok: true, data: updated })
    })
    expect(result.current.state).toEqual({
      status: 'ready',
      home: updated,
      bills: [],
      refreshing: false,
    })
  })

  it('ignores a slow response for a previous home', async () => {
    const waiting = pending<Awaited<ReturnType<typeof getHome>>>()
    const second = { ...home, id: 'B', name: 'Flat B' }
    vi.mocked(getHome).mockImplementation((id) =>
      id === 'A' ? waiting.promise : Promise.resolve({ ok: true, data: second }),
    )
    const { result, rerender } = renderHook(({ id }) => useHome(id), { initialProps: { id: 'A' } })
    rerender({ id: 'B' })
    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'ready',
        home: second,
        bills: [],
        refreshing: false,
      }),
    )
    await act(async () => {
      waiting.finish({ ok: true, data: home })
    })
    expect(result.current.state).toEqual({
      status: 'ready',
      home: second,
      bills: [],
      refreshing: false,
    })
  })

  it('ignores a response after unmount without logging a warning', async () => {
    const waiting = pending<Awaited<ReturnType<typeof getHome>>>()
    vi.mocked(getHome).mockReturnValue(waiting.promise)
    const renders = vi.fn()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { unmount } = renderHook(() => {
        const current = useHome('A')
        renders(current.state)
        return current
      })
      unmount()
      const count = renders.mock.calls.length
      await act(async () => {
        waiting.finish({ ok: true, data: home })
      })
      expect(renders).toHaveBeenCalledTimes(count)
      expect(log).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })
})
