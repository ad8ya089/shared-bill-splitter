import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { type Bill, call, createHome } from './helpers'

describe('unusual input', () => {
  it.each([
    { name: 'SQL text', id: "' OR 1=1; DROP TABLE homes;--" },
    { name: 'null byte', id: '\u0000' },
    { name: 'long id', id: 'a'.repeat(10000) },
    { name: 'unicode', id: 'घर猫' },
    { name: 'blank-looking id', id: '   ' },
  ])('returns JSON errors for $name ids', async ({ id }) => {
    const encoded = encodeURIComponent(id)
    for (const path of [
      `/api/homes/${encoded}`,
      `/api/homes/${encoded}/bills`,
      `/api/homes/${encoded}/balances`,
    ]) {
      const response = await call('GET', path)
      expect(response.status).toBe(404)
      expect(response.body).toEqual({ error: expect.any(String) })
    }
    for (const [path, body] of [
      [`/api/homes/${encoded}/members`, { name: 'Asha' }],
      [`/api/homes/${encoded}/bills`, { title: 'Rent', totalCents: 1000 }],
    ] satisfies [string, object][]) {
      const response = await call('POST', path, { body })
      expect(response.status).toBe(404)
      expect(response.body).toEqual({ error: expect.any(String) })
      const invalid = await call('POST', path, { body: {} })
      expect(invalid.status).toBe(422)
    }
    const paid = await call('POST', `/api/bills/${encoded}/shares/${encoded}/pay`, {
      headers: { 'Idempotency-Key': 'key' },
    })
    expect(paid.status).toBe(404)
    expect(paid.body).toEqual({ error: expect.any(String) })
  })

  it.each([
    [],
    'name',
    null,
    { name: { nested: true }, title: { nested: true }, totalCents: {} },
    { name: 'a'.repeat(10000) },
  ])('rejects an invalid body %j', async (body) => {
    const { homeId } = await createHome([])
    for (const path of [
      '/api/homes',
      `/api/homes/${homeId}/members`,
      `/api/homes/${homeId}/bills`,
    ]) {
      const response = await call('POST', path, { body })
      expect(response.status).toBe(422)
      expect(response.body).toEqual({ error: expect.any(String) })
    }
  })

  it('ignores extra fields and accepts members with the same name', async () => {
    const home = await call<{ id: string; name: string }>('POST', '/api/homes', {
      body: { name: 'Home', ignored: 'secret' },
    })
    expect(home.status).toBe(201)
    expect(home.body).toEqual({ id: expect.any(String), name: 'Home' })
    const first = await call<{ id: string }>('POST', `/api/homes/${home.body.id}/members`, {
      body: { name: 'Asha', ignored: true },
    })
    const second = await call<{ id: string }>('POST', `/api/homes/${home.body.id}/members`, {
      body: { name: 'Asha' },
    })
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(first.body.id).not.toBe(second.body.id)
    const bill = await call<Bill>('POST', `/api/homes/${home.body.id}/bills`, {
      body: { title: 'Rent', totalCents: 1000, shares: [], ignored: true },
    })
    expect(bill.status).toBe(201)
    expect(Object.keys(bill.body).sort()).toEqual(['homeId', 'id', 'shares', 'title', 'totalCents'])
    expect(bill.body.shares).toHaveLength(2)
  })

  it.each(['text/plain', undefined])('parses JSON with content type %s', async (contentType) => {
    const request = new Request('http://localhost/api/homes', {
      method: 'POST',
      body: '{"name":"Home"}',
    })
    if (contentType) request.headers.set('content-type', contentType)
    else request.headers.delete('content-type')
    const response = await exports.default.fetch(request)
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ id: expect.any(String), name: 'Home' })
  })

  it('accepts exponent notation, rejects negative zero and accepts a lowercase key header', async () => {
    const { homeId } = await createHome(['Asha'])
    const accepted = await exports.default.fetch(
      new Request(`http://localhost/api/homes/${homeId}/bills`, {
        method: 'POST',
        body: '{"title":"Rent","totalCents":1e3}',
      }),
    )
    expect(accepted.status).toBe(201)
    const listed = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)
    const bill = listed.body.bills[0]
    const share = bill?.shares[0]
    if (!bill || !share) throw new Error('bill has no share')
    expect(bill.totalCents).toBe(1000)
    const rejected = await exports.default.fetch(
      new Request(`http://localhost/api/homes/${homeId}/bills`, {
        method: 'POST',
        body: '{"title":"Rent","totalCents":-0}',
      }),
    )
    expect(rejected.status).toBe(422)
    const paid = await call('POST', `/api/bills/${bill.id}/shares/${share.id}/pay`, {
      headers: { 'idempotency-key': 'key' },
    })
    expect(paid.status).toBe(200)
  })
})
