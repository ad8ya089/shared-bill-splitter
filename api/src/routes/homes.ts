import { Hono } from 'hono'
import { findHome, insertHome, insertMember } from '../db'
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

homes.post('/api/homes/:homeId/members', async (c) => {
  const parsed = parseCreateNamed(await readJsonBody(c))
  if (!parsed.ok) return jsonError(c, 422, parsed.error)

  const homeId = c.req.param('homeId')
  const home = await findHome(c.env.DB, homeId)
  if (!home) return jsonError(c, 404, 'home not found')

  const member = {
    id: crypto.randomUUID(),
    home_id: homeId,
    name: parsed.value.name,
    created_at: new Date().toISOString(),
  }
  await insertMember(c.env.DB, member)

  return c.json({ id: member.id, homeId, name: member.name }, 201)
})

export default homes
