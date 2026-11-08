import { env, exports } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import app from '../src/index'

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

  it('returns JSON 500 without exposing database internals', async () => {
    const secret = 'private-database-detail-test-secret'
    const brokenEnv: Env = {
      DB: {
        prepare() {
          throw new Error(secret)
        },
        batch: env.DB.batch.bind(env.DB),
        exec: env.DB.exec.bind(env.DB),
        withSession: env.DB.withSession.bind(env.DB),
        dump: env.DB.dump.bind(env.DB),
      },
    }
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const response = await app.fetch(
        new Request('http://localhost/api/homes/test-home'),
        brokenEnv,
      )
      const text = await response.text()

      expect(response.status).toBe(500)
      expect(response.headers.get('content-type')).toContain('application/json')
      const body: unknown = JSON.parse(text)
      expect(body).toEqual({ error: 'internal server error' })
      expect(text).not.toContain(secret)
      expect(logError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: secret }))
    } finally {
      logError.mockRestore()
    }
  })
})
