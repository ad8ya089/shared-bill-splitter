import { createFileRoute } from '@tanstack/react-router'
import { Page } from '../components/Page'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { homeId: string | undefined } => ({
    homeId: typeof search.homeId === 'string' ? search.homeId.trim() || undefined : undefined,
  }),
  component: Home,
})

function Home() {
  const { homeId } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <Page
      homeId={homeId}
      openHome={(id) => {
        void navigate({ to: '/', search: { homeId: id } })
      }}
    />
  )
}
