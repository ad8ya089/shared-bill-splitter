import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createBillWithShares } from '../src/db'
import { type Bill, call, createBill, createHome, type Member } from './helpers'

describe('bill request validation', () => {
  it.each([
    { label: 'zero', totalCents: 0 },
    { label: 'a negative amount', totalCents: -100 },
    { label: 'a fractional amount', totalCents: 10.5 },
    { label: 'a numeric string', totalCents: '1000' },
    { label: 'null', totalCents: null },
    { label: 'a missing amount', totalCents: undefined },
    { label: 'a NaN string', totalCents: 'NaN' },
    { label: 'an Infinity string', totalCents: 'Infinity' },
    { label: 'a huge number', totalCents: 1e300 },
    { label: 'an unsafe integer', totalCents: Number.MAX_SAFE_INTEGER + 1 },
  ])('returns JSON 422 for $label', async ({ totalCents }) => {
    const { homeId } = await createHome(['Asha'])

    const response = await call('POST', `/api/homes/${homeId}/bills`, {
      body: { title: 'Electricity', totalCents },
    })

    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: expect.stringMatching(/\S/) })
  })

  it.each([
    { label: 'a missing title', body: { totalCents: 1000 } },
    { label: 'a blank title', body: { title: ' \t\n ', totalCents: 1000 } },
    { label: 'an overlong title', body: { title: 'a'.repeat(201), totalCents: 1000 } },
    { label: 'a numeric title', body: { title: 42, totalCents: 1000 } },
    { label: 'an empty object', body: {} },
    { label: 'an absent body', body: undefined },
    { label: 'a null body', body: null },
    { label: 'an array body', body: [{ title: 'Electricity', totalCents: 1000 }] },
    { label: 'a string body', body: 'Electricity' },
  ])('returns JSON 422 for $label', async ({ body }) => {
    const { homeId } = await createHome(['Asha'])

    const response = await call('POST', `/api/homes/${homeId}/bills`, { body })

    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: expect.stringMatching(/\S/) })
  })

  it('returns JSON 422 for a raw non-JSON body', async () => {
    const { homeId } = await createHome(['Asha'])
    const response = await exports.default.fetch(
      new Request(`http://localhost/api/homes/${homeId}/bills`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{broken JSON',
      }),
    )

    expect(response.status).toBe(422)
    expect(response.headers.get('content-type')).toContain('application/json')
    const body: unknown = await response.json()
    expect(body).toEqual({ error: expect.stringMatching(/\S/) })
  })

  it('validates the body before looking up a missing home', async () => {
    const response = await call('POST', '/api/homes/does-not-exist/bills', {
      body: { title: 'Electricity', totalCents: 0 },
    })

    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: expect.stringMatching(/totalCents/) })
  })

  it('validates the body before checking for members', async () => {
    const { homeId } = await createHome([])
    const response = await call('POST', `/api/homes/${homeId}/bills`, {
      body: { title: 'Electricity', totalCents: 0 },
    })

    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: expect.stringMatching(/totalCents/) })
  })

  it('returns the state error for a valid bill in a home without members', async () => {
    const { homeId } = await createHome([])
    const response = await call('POST', `/api/homes/${homeId}/bills`, {
      body: { title: 'Electricity', totalCents: 1000 },
    })

    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'home has no members' })
  })
})

describe('bill persistence', () => {
  it('stores and lists zero-cent shares when two cents are split across three members', async () => {
    const { homeId, members } = await createHome(['Asha', 'Ben', 'Chitra'])

    const created = await createBill(homeId, 2)

    expect(created.status).toBe(201)
    expect(created.body.shares.map((share) => share.memberId)).toEqual(
      members.map((member) => member.id),
    )
    expect(created.body.shares.map((share) => share.amountCents)).toEqual([1, 1, 0])
    expect(created.body.shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(2)

    const listed = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)

    expect(listed.status).toBe(200)
    expect(listed.body).toEqual({ bills: [created.body] })
  })

  it('keeps existing bills unchanged when a later member joins', async () => {
    const { homeId, members } = await createHome(['Asha', 'Ben'])
    const original = await createBill(homeId, 1000)
    expect(original.status).toBe(201)
    expect(original.body.shares.map((share) => share.amountCents)).toEqual([500, 500])

    const added = await call<Member>('POST', `/api/homes/${homeId}/members`, {
      body: { name: 'Chitra' },
    })
    expect(added.status).toBe(201)

    const afterJoining = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)
    expect(afterJoining.status).toBe(200)
    expect(afterJoining.body).toEqual({ bills: [original.body] })

    const next = await createBill(homeId, 1000)
    expect(next.status).toBe(201)
    expect(next.body.shares.map((share) => share.memberId)).toEqual([
      ...members.map((member) => member.id),
      added.body.id,
    ])
    expect(next.body.shares.map((share) => share.amountCents)).toEqual([334, 333, 333])

    const final = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)
    expect(final.status).toBe(200)
    expect(final.body).toEqual({ bills: [next.body, original.body] })
  })

  it('rolls back the bill and all shares when a member appears twice', async () => {
    const { homeId, members } = await createHome(['Asha'])
    const member = members[0]
    if (!member) throw new Error('test home has no member')
    const billId = crypto.randomUUID()

    await expect(
      createBillWithShares(env.DB, {
        id: billId,
        homeId,
        title: 'Electricity',
        totalCents: 1000,
        shares: [
          { id: crypto.randomUUID(), memberId: member.id, amountCents: 500 },
          { id: crypto.randomUUID(), memberId: member.id, amountCents: 500 },
        ],
      }),
    ).rejects.toThrow()

    const bill = await env.DB.prepare('SELECT id FROM bills WHERE id = ?').bind(billId).first()
    const shares = await env.DB.prepare('SELECT id FROM shares WHERE bill_id = ?')
      .bind(billId)
      .all()

    expect(bill).toBeNull()
    expect(shares.results).toEqual([])
  })
})

describe('bill listing', () => {
  it('returns an empty list for a home without bills', async () => {
    const { homeId } = await createHome([])

    const response = await call('GET', `/api/homes/${homeId}/bills`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ bills: [] })
  })

  it('lists three bills newest first and matches POST with shares in member order', async () => {
    const { homeId, members } = await createHome(['Zoya', 'Asha', 'Mina'])
    const created: Bill[] = []
    for (const [index, totalCents] of [1000, 2, 3000].entries()) {
      const response = await call<Bill>('POST', `/api/homes/${homeId}/bills`, {
        body: { title: ` \tBill ${index + 1}\n `, totalCents },
      })
      expect(response.status).toBe(201)
      expect(response.body.title).toBe(`Bill ${index + 1}`)
      created.push(response.body)
    }

    const response = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ bills: [...created].reverse() })
    for (const bill of response.body.bills) {
      expect(bill.shares.map((share) => share.memberId)).toEqual(members.map((member) => member.id))
      expect(bill.shares.every((share) => share.paidAt === null)).toBe(true)
      expect(bill.shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(bill.totalCents)
    }
  })

  it('lists only the selected home bills and shares', async () => {
    const first = await createHome(['Asha'])
    const second = await createHome(['Ben'])
    const firstBill = await createBill(first.homeId, 1000)
    const secondBill = await createBill(second.homeId, 2000)
    expect(firstBill.status).toBe(201)
    expect(secondBill.status).toBe(201)

    const firstList = await call('GET', `/api/homes/${first.homeId}/bills`)
    const secondList = await call('GET', `/api/homes/${second.homeId}/bills`)

    expect(firstList.status).toBe(200)
    expect(secondList.status).toBe(200)
    expect(firstList.body).toEqual({ bills: [firstBill.body] })
    expect(secondList.body).toEqual({ bills: [secondBill.body] })
  })

  it('returns JSON 404 for a missing home', async () => {
    const response = await call('GET', '/api/homes/does-not-exist/bills')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'home not found' })
  })
})

it('round-trips the largest safe amount and rejects the next integer', async () => {
  const { homeId } = await createHome(['Asha', 'Ben', 'Chitra'])

  const created = await createBill(homeId, Number.MAX_SAFE_INTEGER)

  expect(created.status).toBe(201)
  expect(created.body.totalCents).toBe(Number.MAX_SAFE_INTEGER)
  expect(created.body.shares).toHaveLength(3)
  expect(created.body.shares.map((share) => share.amountCents)).toEqual([
    3002399751580331, 3002399751580330, 3002399751580330,
  ])
  expect(created.body.shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(
    Number.MAX_SAFE_INTEGER,
  )

  const listed = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)
  expect(listed.status).toBe(200)
  expect(listed.body).toEqual({ bills: [created.body] })

  const unsafe = await createBill(homeId, Number.MAX_SAFE_INTEGER + 1)
  expect(unsafe.status).toBe(422)
  expect(unsafe.body).toEqual({ error: expect.stringMatching(/totalCents/) })

  const afterRejected = await call('GET', `/api/homes/${homeId}/bills`)
  expect(afterRejected.status).toBe(200)
  expect(afterRejected.body).toEqual({ bills: [created.body] })
})
