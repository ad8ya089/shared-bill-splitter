import { Hono } from 'hono'
import { findHome, listBalances, payShare } from '../db'
import { jsonError } from '../http'
import { parseIdempotencyKey } from '../validation'

const payments = new Hono<{ Bindings: Env }>()

payments.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const key = parseIdempotencyKey(c.req.header('Idempotency-Key'))
  if (!key.ok) return jsonError(c, 400, key.error)

  const payment = await payShare(c.env.DB, c.req.param('billId'), c.req.param('shareId'), key.value)
  if (payment.status === 'missing') return jsonError(c, 404, 'share not found')
  if (payment.status === 'already paid') return jsonError(c, 409, 'share already paid')

  return c.json(payment.share)
})

payments.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await findHome(c.env.DB, homeId)
  if (!home) return jsonError(c, 404, 'home not found')

  return c.json({ balances: await listBalances(c.env.DB, homeId) })
})

export default payments
