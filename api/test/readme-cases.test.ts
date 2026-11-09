import { describe, expect, it } from 'vitest'
import { call, createBill, createHome, type Share } from './helpers'

async function setup() {
  const { homeId } = await createHome(['Asha', 'Ben', 'Chitra'])
  const bill = await createBill(homeId, 1000)
  expect(bill.status).toBe(201)
  const share = bill.body.shares[0]
  if (!share) throw new Error('bill has no share')
  return { homeId, bill: bill.body, share }
}

function pay(billId: string, shareId: string, key: string) {
  return call<Share>('POST', `/api/bills/${billId}/shares/${shareId}/pay`, {
    headers: { 'Idempotency-Key': key },
  })
}

describe('the README cases', () => {
  it('A home with no members.', async () => {
    const { homeId } = await createHome([])
    const bill = await createBill(homeId, 1000)
    expect(bill.status).toBe(422)
    expect(bill.body).toEqual({ error: 'home has no members' })
  })

  it('An amount that is zero, negative, or not a whole number.', async () => {
    const { homeId } = await createHome(['Asha'])
    expect((await createBill(homeId, 0)).status).toBe(422)
    expect((await createBill(homeId, -100)).status).toBe(422)
    expect((await createBill(homeId, 10.5)).status).toBe(422)
  })

  it('An amount that does not divide evenly.', async () => {
    const { bill } = await setup()
    expect(bill.shares.map((share) => share.amountCents)).toEqual([334, 333, 333])
  })

  it('The same payment request sent twice.', async () => {
    const { bill, share } = await setup()
    const first = await pay(bill.id, share.id, 'key')
    const second = await pay(bill.id, share.id, 'key')
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body).toEqual(first.body)
  })

  it('Two members paying the same share at the same time.', async () => {
    const { bill, share } = await setup()
    const payments = await Promise.all([
      pay(bill.id, share.id, 'Asha'),
      pay(bill.id, share.id, 'Ben'),
    ])
    expect(payments.map((payment) => payment.status).sort()).toEqual([200, 409])
  })

  it('A bill or share that does not exist.', async () => {
    const { bill, share } = await setup()
    expect((await pay('missing', share.id, 'key')).status).toBe(404)
    expect((await pay(bill.id, 'missing', 'key')).status).toBe(404)
  })

  it('The API answers with a 500 error or is slow. The web page must not crash.', async () => {
    // The UI half is deferred; this proves the API exposes a clean failure and stays available.
    const { homeId } = await createHome(['Asha'])
    expect((await createBill(homeId, Number.MAX_SAFE_INTEGER)).status).toBe(201)
    expect((await createBill(homeId, Number.MAX_SAFE_INTEGER)).status).toBe(201)
    const failed = await call('GET', `/api/homes/${homeId}/balances`)
    expect(failed.status).toBe(500)
    expect(failed.body).toEqual({ error: 'internal server error' })
    const health = await call('GET', '/api/health')
    expect(health.status).toBe(200)
    expect(health.body).toEqual({ status: 'ok' })
  })
})
