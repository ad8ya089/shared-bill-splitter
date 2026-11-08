import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { call, createHome } from './helpers'

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
