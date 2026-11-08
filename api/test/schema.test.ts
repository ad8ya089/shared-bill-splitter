import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

async function insertHome(name = 'Test home') {
  const id = crypto.randomUUID()
  await env.DB.prepare('INSERT INTO homes (id, name, created_at) VALUES (?, ?, ?)')
    .bind(id, name, new Date().toISOString())
    .run()
  return id
}

async function insertMember(homeId: string) {
  const id = crypto.randomUUID()
  await env.DB.prepare('INSERT INTO members (id, home_id, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, homeId, 'Asha', new Date().toISOString())
    .run()
  return id
}

async function insertBill(homeId: string, totalCents = 1000) {
  const id = crypto.randomUUID()
  await env.DB.prepare(
    'INSERT INTO bills (id, home_id, title, total_cents, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id, homeId, 'Electricity', totalCents, new Date().toISOString())
    .run()
  return id
}

async function insertShare(
  billId: string,
  memberId: string,
  amountCents = 1000,
  paidAt: string | null = null,
  paidKey: string | null = null,
) {
  const id = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO shares (id, bill_id, member_id, amount_cents, paid_at, paid_idempotency_key)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, billId, memberId, amountCents, paidAt, paidKey)
    .run()
  return id
}

describe('database constraints', () => {
  it('inserts a valid home, member, bill and share', async () => {
    const homeId = await insertHome()
    const memberId = await insertMember(homeId)
    const billId = await insertBill(homeId)
    const shareId = await insertShare(billId, memberId)

    const share = await env.DB.prepare(
      'SELECT bill_id, member_id, amount_cents, paid_at, paid_idempotency_key FROM shares WHERE id = ?',
    )
      .bind(shareId)
      .first()

    expect(share).toEqual({
      bill_id: billId,
      member_id: memberId,
      amount_cents: 1000,
      paid_at: null,
      paid_idempotency_key: null,
    })
  })

  it('rejects a member whose home does not exist', async () => {
    await expect(insertMember(crypto.randomUUID())).rejects.toThrow()
  })

  it.each([0, -5, 10.5])('rejects a bill total of %s', async (totalCents) => {
    const homeId = await insertHome()

    await expect(insertBill(homeId, totalCents)).rejects.toThrow()
  })

  it('rejects a blank home name', async () => {
    await expect(insertHome('   ')).rejects.toThrow()
  })

  it('rejects a second share for the same bill and member', async () => {
    const homeId = await insertHome()
    const memberId = await insertMember(homeId)
    const billId = await insertBill(homeId)
    await insertShare(billId, memberId)

    await expect(insertShare(billId, memberId)).rejects.toThrow()
  })

  it('rejects a negative share amount', async () => {
    const homeId = await insertHome()
    const memberId = await insertMember(homeId)
    const billId = await insertBill(homeId)

    await expect(insertShare(billId, memberId, -1)).rejects.toThrow()
  })

  it('rejects a paid timestamp without an idempotency key', async () => {
    const homeId = await insertHome()
    const memberId = await insertMember(homeId)
    const billId = await insertBill(homeId)

    await expect(
      insertShare(billId, memberId, 1000, new Date().toISOString(), null),
    ).rejects.toThrow()
  })

  it('rejects an idempotency key without a paid timestamp', async () => {
    const homeId = await insertHome()
    const memberId = await insertMember(homeId)
    const billId = await insertBill(homeId)

    await expect(insertShare(billId, memberId, 1000, null, 'payment-key')).rejects.toThrow()
  })
})
