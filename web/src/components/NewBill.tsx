import { type SubmitEvent, useRef, useState } from 'react'
import { createBill } from '../lib/api'
import { parseDollars } from '../lib/money'

export function NewBill({ homeId, onSaved }: { homeId: string; onSaved: () => void }) {
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const busy = useRef(false)

  async function add(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    if (!title.trim()) {
      setMessage('enter a bill title')
      return
    }
    const cents = parseDollars(amount)
    if (cents === null) {
      setMessage('enter a positive amount with up to two decimal places')
      return
    }
    busy.current = true
    setSubmitting(true)
    setMessage('')
    try {
      const bill = await createBill(homeId, title.trim(), cents)
      if (!bill.ok) {
        setMessage(bill.message)
        return
      }
      setTitle('')
      setAmount('')
      onSaved()
    } finally {
      busy.current = false
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={add}>
      <label htmlFor="bill-title">Bill title</label>
      <input
        id="bill-title"
        value={title}
        maxLength={200}
        disabled={submitting}
        onChange={(event) => setTitle(event.target.value)}
      />
      <label htmlFor="bill-amount">Amount (USD)</label>
      <input
        id="bill-amount"
        inputMode="decimal"
        value={amount}
        disabled={submitting}
        onChange={(event) => setAmount(event.target.value)}
      />
      <button type="submit" disabled={submitting}>
        {submitting ? 'Adding...' : 'Add bill'}
      </button>
      {message && <p role="alert">{message}</p>}
    </form>
  )
}
