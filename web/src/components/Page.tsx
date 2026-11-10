import { useHome } from '../lib/useHome'
import { usePayShare } from '../lib/usePayShare'
import { BillList } from './BillList'
import { Members } from './Members'
import { NewBill } from './NewBill'
import { NewHome } from './NewHome'

export function Page({
  homeId,
  openHome,
}: {
  homeId: string | undefined
  openHome: (id: string | undefined) => void
}) {
  const { state, reload } = useHome(homeId)
  const { pay, stateOf } = usePayShare(reload)
  if (homeId === undefined) return <NewHome openHome={openHome} />
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <main aria-busy="true">
        <h1>Bill splitter</h1>
        <p role="status">Loading...</p>
      </main>
    )
  }
  if (state.status === 'error' && state.notFound) {
    return (
      <main>
        <h1>Home not found</h1>
        <button type="button" onClick={() => openHome(undefined)}>
          Start over
        </button>
      </main>
    )
  }
  if (state.status === 'error') {
    return (
      <main>
        <h1>Bill splitter</h1>
        <p role="alert">{state.message}</p>
        <button
          type="button"
          onClick={() => {
            void reload()
          }}
        >
          Try again
        </button>
      </main>
    )
  }

  const { home, bills, refreshing } = state
  return (
    <main>
      <header>
        <p className="eyebrow">Your shared home</p>
        <h1>{home.name}</h1>
        <p>
          Home ID <code className="home-id">{home.id}</code>
        </p>
        <a
          href="/"
          onClick={(event) => {
            event.preventDefault()
            openHome(undefined)
          }}
        >
          Start over
        </a>
      </header>
      <p className="status-note" aria-live="polite">
        {refreshing ? 'Refreshing...' : ''}
      </p>
      <Members key={home.id} homeId={home.id} members={home.members} onSaved={reload} />
      <section aria-labelledby="new-bill-heading">
        <h2 id="new-bill-heading">Add a bill</h2>
        {home.members.length === 0 ? (
          <p>Add a member before adding a bill</p>
        ) : (
          <NewBill key={home.id} homeId={home.id} onSaved={reload} />
        )}
      </section>
      <BillList bills={bills} members={home.members} pay={pay} stateOf={stateOf} />
    </main>
  )
}
