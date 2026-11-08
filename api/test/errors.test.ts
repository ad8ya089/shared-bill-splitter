import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

describe('JSON errors', () => {
  it.each([
    { label: 'an unknown route', method: 'GET', path: '/api/does-not-exist' },
    { label: 'a wrong method', method: 'PUT', path: '/api/homes' },
  ])('returns JSON 404 for $label', async ({ method, path }) => {
    const response = await exports.default.fetch(new Request(`http://localhost${path}`, { method }))

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    const body: unknown = await response.json()
    expect(body).toEqual({ error: 'not found' })
  })
})
