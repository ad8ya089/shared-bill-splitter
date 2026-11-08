import { Hono } from 'hono'
import { jsonError } from './http'
import bills from './routes/bills'
import homes from './routes/homes'
import payments from './routes/payments'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.route('/', homes)
app.route('/', bills)
app.route('/', payments)

app.notFound((c) => jsonError(c, 404, 'not found'))

app.onError((error, c) => {
  console.error(error)
  return jsonError(c, 500, 'internal server error')
})

export default app
