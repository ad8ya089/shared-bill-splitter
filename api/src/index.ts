import { Hono } from 'hono'
import homes from './routes/homes'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.route('/', homes)

export default app
