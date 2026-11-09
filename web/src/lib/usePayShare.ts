import { useCallback, useEffect, useRef, useState } from 'react'
import { payShare } from './api'

type PaymentState =
  | { status: 'idle' }
  | { status: 'paying' }
  | { status: 'failed'; message: string }

export function usePayShare(onSettled: () => void): {
  pay: (billId: string, shareId: string) => Promise<void>
  stateOf: (shareId: string) => PaymentState
} {
  const keys = useRef(new Map<string, string>())
  const paying = useRef(new Set<string>())
  const mounted = useRef(true)
  const [states, setStates] = useState(new Map<string, PaymentState>())

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const pay = useCallback(
    async (billId: string, shareId: string) => {
      if (paying.current.has(shareId)) return
      const key = keys.current.get(shareId) ?? crypto.randomUUID()
      keys.current.set(shareId, key)
      paying.current.add(shareId)
      setStates((previous) => new Map(previous).set(shareId, { status: 'paying' }))

      const payment = await payShare(billId, shareId, key)
      paying.current.delete(shareId)
      const terminal = !payment.ok && (payment.status === 409 || payment.status === 404)
      if (payment.ok || terminal) keys.current.delete(shareId)
      if (!mounted.current) return
      if (payment.ok) {
        setStates((previous) => {
          const next = new Map(previous)
          next.delete(shareId)
          return next
        })
        onSettled()
        return
      }
      const message =
        payment.status === 409
          ? 'already paid'
          : payment.status === 404
            ? 'this share no longer exists'
            : payment.message
      setStates((previous) => new Map(previous).set(shareId, { status: 'failed', message }))
      if (terminal) onSettled()
    },
    [onSettled],
  )

  return { pay, stateOf: (shareId) => states.get(shareId) ?? { status: 'idle' } }
}
