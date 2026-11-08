import { Hono } from 'hono'
import { insertHome } from '../db'
import { jsonError, readJsonBody } from '../http'
import { parseCreateNamed } from '../validation'

const homes = new Hono<{ Bindings: Env }>()

homes.post('/api/homes', async (c) => {
  const parsed = parseCreateNamed(await readJsonBody(c))
  if (!parsed.ok) return jsonError(c, 422, parsed.error)

  const home = {
    id: crypto.randomUUID(),
    name: parsed.value.name,
    created_at: new Date().toISOString(),
  }
  await insertHome(c.env.DB, home)

  return c.json({ id: home.id, name: home.name }, 201)
})

export default homes
