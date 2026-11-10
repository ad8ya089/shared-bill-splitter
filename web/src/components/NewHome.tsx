import { type SubmitEvent, useRef, useState } from 'react'
import { createHome } from '../lib/api'

export function NewHome({ openHome }: { openHome: (id: string | undefined) => void }) {
  const [name, setName] = useState('')
  const [homeId, setHomeId] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const busy = useRef(false)

  async function create(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    if (!name.trim()) {
      setMessage('enter a home name')
      return
    }
    busy.current = true
    setSubmitting(true)
    setMessage('')
    try {
      const home = await createHome(name.trim())
      if (!home.ok) {
        setMessage(home.message)
        return
      }
      openHome(home.data.id)
    } finally {
      busy.current = false
      setSubmitting(false)
    }
  }

  return (
    <main>
      <header>
        <p className="eyebrow">Shared home, shared costs</p>
        <h1>Bill splitter</h1>
        <p>Keep household bills clear. Everyone pays their own share.</p>
      </header>
      <section aria-labelledby="new-home-heading">
        <h2 id="new-home-heading">Create a home</h2>
        <form onSubmit={create}>
          <label htmlFor="home-name">Home name</label>
          <input
            id="home-name"
            value={name}
            maxLength={200}
            disabled={submitting}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create home'}
          </button>
          {message && <p role="alert">{message}</p>}
        </form>
      </section>
      <section aria-labelledby="open-home-heading">
        <h2 id="open-home-heading">Open an existing home</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const id = homeId.trim()
            if (id) openHome(id)
          }}
        >
          <label htmlFor="home-id">Home ID</label>
          <input id="home-id" value={homeId} onChange={(event) => setHomeId(event.target.value)} />
          <button type="submit">Open</button>
        </form>
      </section>
    </main>
  )
}
