import { env, exports } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'
import app from '../src/index'
import { call, createBill, createHome } from './helpers'

async function expectError(response: Response, status: number) {
  expect(response.status).toBe(status)
  expect(response.headers.get('content-type')).toContain('application/json')
  const text = await response.text()
  const body: unknown = JSON.parse(text)
  expect(body).toEqual({ error: expect.any(String) })
  for (const secret of ['stack', 'SQLITE', 'D1_', 'at ', 'node_modules', '.ts:']) {
    expect(text).not.toContain(secret)
  }
}

it('returns only JSON errors for every endpoint and error status', async () => {
  const { homeId } = await createHome(['Asha'])
  const empty = await createHome([])
  const bill = await createBill(homeId, 1000)
  const share = bill.body.shares[0]
  if (!share) throw new Error('bill has no share')
  const payPath = `/api/bills/${bill.body.id}/shares/${share.id}/pay`
  const paid = await call('POST', payPath, { headers: { 'Idempotency-Key': 'first' } })
  expect(paid.status).toBe(200)
  const cases: {
    method: string
    path: string
    status: number
    body?: unknown
    headers?: Record<string, string>
  }[] = [
    { method: 'POST', path: '/api/homes', body: {}, status: 422 },
    { method: 'POST', path: `/api/homes/${homeId}/members`, body: {}, status: 422 },
    { method: 'POST', path: '/api/homes/missing/members', body: { name: 'Asha' }, status: 404 },
    { method: 'POST', path: `/api/homes/${homeId}/bills`, body: {}, status: 422 },
    {
      method: 'POST',
      path: `/api/homes/${empty.homeId}/bills`,
      body: { title: 'Rent', totalCents: 1 },
      status: 422,
    },
    {
      method: 'POST',
      path: '/api/homes/missing/bills',
      body: { title: 'Rent', totalCents: 1 },
      status: 404,
    },
    { method: 'POST', path: payPath, status: 400 },
    {
      method: 'POST',
      path: '/api/bills/missing/shares/missing/pay',
      headers: { 'Idempotency-Key': 'key' },
      status: 404,
    },
    { method: 'POST', path: payPath, headers: { 'Idempotency-Key': 'second' }, status: 409 },
    { method: 'GET', path: '/api/homes/missing', status: 404 },
    { method: 'GET', path: '/api/homes/missing/bills', status: 404 },
    { method: 'GET', path: '/api/homes/missing/balances', status: 404 },
    { method: 'GET', path: '/api/unknown', status: 404 },
    { method: 'PUT', path: '/api/homes', status: 404 },
  ]
  for (const entry of cases) {
    const response = await exports.default.fetch(
      new Request(`http://localhost${entry.path}`, {
        method: entry.method,
        headers: { 'content-type': 'application/json', ...entry.headers },
        body: entry.body === undefined ? undefined : JSON.stringify(entry.body),
      }),
    )
    await expectError(response, entry.status)
  }

  const brokenEnv: Env = {
    DB: {
      prepare() {
        throw new Error('SQLITE D1_private stack at node_modules/private.ts:10')
      },
      batch: env.DB.batch.bind(env.DB),
      exec: env.DB.exec.bind(env.DB),
      withSession: env.DB.withSession.bind(env.DB),
      dump: env.DB.dump.bind(env.DB),
    },
  }
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    for (const path of [
      `/api/homes/${homeId}`,
      `/api/homes/${homeId}/bills`,
      `/api/homes/${homeId}/balances`,
    ]) {
      await expectError(await app.fetch(new Request(`http://localhost${path}`), brokenEnv), 500)
    }
    for (const entry of [
      { path: '/api/homes', body: { name: 'Home' } },
      { path: `/api/homes/${homeId}/members`, body: { name: 'Asha' } },
      { path: `/api/homes/${homeId}/bills`, body: { title: 'Rent', totalCents: 1000 } },
      { path: payPath, body: undefined },
    ]) {
      await expectError(
        await app.fetch(
          new Request(`http://localhost${entry.path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'Idempotency-Key': 'key' },
            body: JSON.stringify(entry.body),
          }),
          brokenEnv,
        ),
        500,
      )
    }
  } finally {
    log.mockRestore()
  }
  const health = await exports.default.fetch(new Request('http://localhost/api/health'))
  expect(health.status).toBe(200)
  expect(await health.json()).toEqual({ status: 'ok' })
})
