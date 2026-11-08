import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { type Balance, call, createBill, createHome } from './helpers'

describe('balances edge cases', () => {
  it('lists a fully paid member and a later member without shares with zero balances', async () => {
    const { homeId, members } = await createHome(['Asha'])
    const bill = await createBill(homeId, 1000)
    expect(bill.status).toBe(201)
    for (const share of bill.body.shares) {
      const paid = await call('POST', `/api/bills/${bill.body.id}/shares/${share.id}/pay`, {
        headers: { 'Idempotency-Key': 'key' },
      })
      expect(paid.status).toBe(200)
    }
    const added = await call<{ id: string }>('POST', `/api/homes/${homeId}/members`, {
      body: { name: 'Ben' },
    })
    expect(added.status).toBe(201)
    const outstanding = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(outstanding.status).toBe(200)
    expect(outstanding.body.balances).toEqual([
      ...members.map((member) => ({ memberId: member.id, name: member.name, outstandingCents: 0 })),
      { memberId: added.body.id, name: 'Ben', outstandingCents: 0 },
    ])
  })

  it('sums unpaid shares across bills and preserves member order', async () => {
    const { homeId, members } = await createHome(['Zoya', 'Asha', 'Mina'])
    const first = await createBill(homeId, 1000)
    const second = await createBill(homeId, 500)
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    const firstShare = first.body.shares[0]
    const secondShare = second.body.shares[1]
    if (!firstShare || !secondShare) throw new Error('bill has no share')
    for (const payment of [
      { bill: first.body, share: firstShare },
      { bill: second.body, share: secondShare },
    ]) {
      const { bill, share } = payment
      const paid = await call('POST', `/api/bills/${bill.id}/shares/${share.id}/pay`, {
        headers: { 'Idempotency-Key': 'key' },
      })
      expect(paid.status).toBe(200)
    }
    const outstanding = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(outstanding.status).toBe(200)
    expect(outstanding.body.balances).toEqual(
      members.map((member, index) => ({
        memberId: member.id,
        name: member.name,
        outstandingCents: [167, 333, 499][index],
      })),
    )
  })

  it('returns JSON 500 when the unpaid total exceeds the safe integer range', async () => {
    const { homeId, members } = await createHome(['Asha'])
    const member = members[0]
    if (!member) throw new Error('home has no member')
    for (let index = 0; index < 2; index++) {
      const billId = crypto.randomUUID()
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO bills (id, home_id, title, total_cents, created_at) VALUES (?, ?, ?, ?, ?)',
        ).bind(billId, homeId, 'Rent', Number.MAX_SAFE_INTEGER, new Date().toISOString()),
        env.DB.prepare(
          'INSERT INTO shares (id, bill_id, member_id, amount_cents) VALUES (?, ?, ?, ?)',
        ).bind(crypto.randomUUID(), billId, member.id, Number.MAX_SAFE_INTEGER),
      ])
    }
    const sum = await env.DB.prepare(
      'SELECT SUM(amount_cents) AS total FROM shares WHERE member_id = ?',
    )
      .bind(member.id)
      .first<{ total: number }>()
    expect(sum?.total).toBeGreaterThan(Number.MAX_SAFE_INTEGER)
    expect(Number.isSafeInteger(sum?.total)).toBe(false)

    const response = await call('GET', `/api/homes/${homeId}/balances`)
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'internal server error' })
  })
})
