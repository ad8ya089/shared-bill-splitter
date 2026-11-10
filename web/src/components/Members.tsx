import { type SubmitEvent, useRef, useState } from 'react'
import { addMember, type Member } from '../lib/api'

export function Members({
  homeId,
  members,
  onSaved,
}: {
  homeId: string
  members: Member[]
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const busy = useRef(false)

  async function add(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    if (!name.trim()) {
      setMessage('enter a member name')
      return
    }
    busy.current = true
    setSubmitting(true)
    setMessage('')
    try {
      const member = await addMember(homeId, name.trim())
      if (!member.ok) {
        setMessage(member.message)
        return
      }
      setName('')
      onSaved()
    } finally {
      busy.current = false
      setSubmitting(false)
    }
  }

  return (
    <section aria-labelledby="members-heading">
      <h2 id="members-heading">Members</h2>
      {members.length === 0 ? (
        <p>No members yet.</p>
      ) : (
        <ul className="members">
          {members.map((member) => (
            <li key={member.id}>{member.name}</li>
          ))}
        </ul>
      )}
      <form onSubmit={add}>
        <label htmlFor="member-name">Member name</label>
        <input
          id="member-name"
          value={name}
          maxLength={200}
          disabled={submitting}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Adding...' : 'Add member'}
        </button>
        {message && <p role="alert">{message}</p>}
      </form>
    </section>
  )
}
