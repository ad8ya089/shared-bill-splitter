import { expect, it } from 'vitest'
import { type Balance, type Bill, call, createBill, createHome } from './helpers'

it('creates, lists and pays bills for a home with 300 members', async () => {
  const { homeId, members } = await createHome(Array.from({ length: 300 }, (_, i) => `Member ${i}`))
  const created = await createBill(homeId, 100001)
  expect(created.status).toBe(201)
  expect(created.body.shares).toHaveLength(300)
  const base = Math.floor(100001 / 300)
  const extra = 100001 % 300
  expect(created.body.shares.map((share) => share.amountCents)).toEqual(
    members.map((_, i) => base + (i < extra ? 1 : 0)),
  )
  expect(created.body.shares.map((share) => share.memberId)).toEqual(
    members.map((member) => member.id),
  )
  expect(created.body.shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(100001)
  const listed = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)
  expect(listed.status).toBe(200)
  expect(listed.body).toEqual({ bills: [created.body] })

  const paidShares = created.body.shares.slice(0, 2)
  for (const share of paidShares) {
    const paid = await call('POST', `/api/bills/${created.body.id}/shares/${share.id}/pay`, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    })
    expect(paid.status).toBe(200)
  }
  const balances = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
  expect(balances.status).toBe(200)
  expect(balances.body.balances).toEqual(
    members.map((member, i) => ({
      memberId: member.id,
      name: member.name,
      outstandingCents: i < 2 ? 0 : base + (i < extra ? 1 : 0),
    })),
  )

  const tiny = await createBill(homeId, 1)
  expect(tiny.status).toBe(201)
  expect(tiny.body.shares.map((share) => share.amountCents)).toEqual([
    1,
    ...Array.from({ length: 299 }, () => 0),
  ])
  const final = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)
  expect(final.status).toBe(200)
  expect(final.body.bills[0]).toEqual(tiny.body)
}, 30000)
