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
  const isMounted = useRef(true)
  const [states, setStates] = useState(new Map<string, PaymentState>())

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  const pay = useCallback(
    async (billId: string, shareId: string) => {
      if (paying.current.has(shareId)) return
      // A failed request may already have committed, so retries must keep the same key.
      const key = keys.current.get(shareId) ?? crypto.randomUUID()
      keys.current.set(shareId, key)
      paying.current.add(shareId)
      setStates((previous) => new Map(previous).set(shareId, { status: 'paying' }))

      const payment = await payShare(billId, shareId, key)
      paying.current.delete(shareId)
      const cannotRetry = !payment.ok && (payment.status === 409 || payment.status === 404)
      if (payment.ok || cannotRetry) keys.current.delete(shareId)
      if (!isMounted.current) return
      if (payment.ok) {
        setStates((previous) => {
          const next = new Map(previous)
          next.delete(shareId)
          return next
        })
        onSettled()
        return
      }
      let message = payment.message
      if (payment.status === 409) message = 'already paid'
      else if (payment.status === 404) message = 'this share no longer exists'
      setStates((previous) => new Map(previous).set(shareId, { status: 'failed', message }))
      if (cannotRetry) onSettled()
    },
    [onSettled],
  )

  return { pay, stateOf: (shareId) => states.get(shareId) ?? { status: 'idle' } }
}
