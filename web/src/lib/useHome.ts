import { useCallback, useEffect, useRef, useState } from 'react'
import { type Bill, getBills, getHome, type Home } from './api'

type HomeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; home: Home; bills: Bill[]; refreshing: boolean }
  | { status: 'error'; message: string; notFound: boolean }

export function useHome(homeId: string | undefined): {
  state: HomeState
  reload: () => Promise<void>
} {
  const [state, setState] = useState<HomeState>({
    status: homeId === undefined ? 'idle' : 'loading',
  })
  const request = useRef(0)

  const reload = useCallback(async () => {
    const current = ++request.current
    if (homeId === undefined) {
      setState({ status: 'idle' })
      return
    }
    setState((previous) =>
      previous.status === 'ready' && previous.home.id === homeId
        ? { ...previous, refreshing: true }
        : { status: 'loading' },
    )
    const [home, bills] = await Promise.all([getHome(homeId), getBills(homeId)])
    if (current !== request.current) return
    if (!home.ok) {
      setState({ status: 'error', message: home.message, notFound: home.status === 404 })
      return
    }
    if (!bills.ok) {
      setState({ status: 'error', message: bills.message, notFound: false })
      return
    }
    setState({ status: 'ready', home: home.data, bills: bills.data, refreshing: false })
  }, [homeId])

  useEffect(() => {
    void reload()
    return () => {
      request.current++
    }
  }, [reload])

  return { state, reload }
}
