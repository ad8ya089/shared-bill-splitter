import { describe, expect, it } from 'vitest'
import { type Balance, type Bill, call, createBill, createHome, type Share } from './helpers'

async function setup() {
  const { homeId, members } = await createHome(['Asha', 'Ben'])
  const bill = await createBill(homeId, 1000)
  expect(bill.status).toBe(201)
  const share = bill.body.shares[0]
  if (!share) throw new Error('bill has no shares')
  return { homeId, members, bill: bill.body, share }
}

function pay(billId: string, shareId: string, key: string | undefined) {
  return call<Share>('POST', `/api/bills/${billId}/shares/${shareId}/pay`, {
    headers: key === undefined ? {} : { 'Idempotency-Key': key },
  })
}

describe('payment edge cases', () => {
  it.each([undefined, '', '   ', 'a'.repeat(256)])(
    'rejects the key %j without paying',
    async (key) => {
      const { homeId, bill, share } = await setup()
      const rejected = await pay(bill.id, share.id, key)
      expect(rejected.status).toBe(400)
      expect(rejected.body).toEqual({ error: expect.any(String) })
      const listed = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)
      expect(listed.status).toBe(200)
      expect(listed.body).toEqual({ bills: [bill] })
    },
  )

  it.each([undefined, '', '   ', 'a'.repeat(256)])(
    'checks the key %j before looking up resources',
    async (key) => {
      const rejected = await pay('missing-bill', 'missing-share', key)
      expect(rejected.status).toBe(400)
      expect(rejected.body).toEqual({ error: expect.any(String) })
    },
  )

  it('returns 404 for a share from another bill and leaves it unpaid', async () => {
    const { homeId, bill, share } = await setup()
    const other = await createBill(homeId, 2000)
    expect(other.status).toBe(201)
    const rejected = await pay(other.body.id, share.id, 'key')
    expect(rejected.status).toBe(404)
    expect(rejected.body).toEqual({ error: 'share not found' })
    const listed = await call('GET', `/api/homes/${homeId}/bills`)
    expect(listed.body).toEqual({ bills: [other.body, bill] })
  })

  it('returns the identical body when a trimmed key is replayed', async () => {
    const { bill, share } = await setup()
    const key = 'a'.repeat(255)
    const first = await pay(bill.id, share.id, `  ${key}  `)
    const replay = await pay(bill.id, share.id, key)
    expect(first.status).toBe(200)
    expect(first.body).toEqual({ ...share, paidAt: expect.any(String) })
    expect(replay.status).toBe(200)
    expect(replay.body).toEqual(first.body)
  })

  it('rejects a second key and keeps the first paid time', async () => {
    const { homeId, bill, share } = await setup()
    const first = await pay(bill.id, share.id, 'first')
    expect(first.status).toBe(200)
    const rejected = await pay(bill.id, share.id, 'second')
    expect(rejected.status).toBe(409)
    expect(rejected.body).toEqual({ error: 'share already paid' })
    const listed = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)
    expect(listed.body.bills[0]?.shares[0]).toEqual(first.body)
  })

  it('allows the same key on different shares', async () => {
    const { bill } = await setup()
    for (const share of bill.shares) {
      const paid = await pay(bill.id, share.id, 'same-key')
      expect(paid.status).toBe(200)
      expect(paid.body).toEqual({ ...share, paidAt: expect.any(String) })
    }
  })

  it('changes only the paid member balance', async () => {
    const { homeId, members, bill, share } = await setup()
    const paid = await pay(bill.id, share.id, 'key')
    expect(paid.status).toBe(200)
    const outstanding = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(outstanding.status).toBe(200)
    expect(outstanding.body.balances).toEqual(
      members.map((member) => ({
        memberId: member.id,
        name: member.name,
        outstandingCents: member.id === share.memberId ? 0 : 500,
      })),
    )
  })
})
