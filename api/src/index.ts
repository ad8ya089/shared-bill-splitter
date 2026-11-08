import { Hono } from 'hono'
import { jsonError } from './http'
import homes from './routes/homes'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.route('/', homes)

app.notFound((c) => jsonError(c, 404, 'not found'))

app.onError((error, c) => {
  console.error(error)
  return jsonError(c, 500, 'internal server error')
})

export default app
