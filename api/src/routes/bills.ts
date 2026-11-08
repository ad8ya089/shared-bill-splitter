import { Hono } from 'hono'
import { createBillWithShares, findHome, listBillsWithShares, listMembers } from '../db'
import { jsonError, readJsonBody } from '../http'
import { splitCents } from '../split'
import { parseCreateBill } from '../validation'

const bills = new Hono<{ Bindings: Env }>()

bills.post('/api/homes/:homeId/bills', async (c) => {
  const parsed = parseCreateBill(await readJsonBody(c))
  if (!parsed.ok) return jsonError(c, 422, parsed.error)

  const homeId = c.req.param('homeId')
  const home = await findHome(c.env.DB, homeId)
  if (!home) return jsonError(c, 404, 'home not found')

  const members = await listMembers(c.env.DB, homeId)
  if (members.length === 0) return jsonError(c, 422, 'home has no members')

  const shares = splitCents(parsed.value.totalCents, members.length).map((amountCents, index) => {
    const member = members[index]
    if (!member) throw new Error('split does not match member count')

    return { id: crypto.randomUUID(), memberId: member.id, amountCents, paidAt: null }
  })
  const bill = { id: crypto.randomUUID(), homeId, ...parsed.value, shares }
  await createBillWithShares(c.env.DB, bill)

  return c.json(bill, 201)
})

bills.get('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await findHome(c.env.DB, homeId)
  if (!home) return jsonError(c, 404, 'home not found')

  return c.json({ bills: await listBillsWithShares(c.env.DB, homeId) })
})

export default bills
