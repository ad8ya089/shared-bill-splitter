import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { call, createHome, type Member } from './helpers'

type Home = { id: string; name: string; members: Member[] }

describe.each([
  { label: 'home', isMember: false },
  { label: 'member', isMember: true },
])('$label validation', ({ isMember }) => {
  async function targetPath() {
    if (!isMember) return '/api/homes'
    const { homeId } = await createHome([])
    return `/api/homes/${homeId}/members`
  }

  it.each([
    { label: 'missing name', body: {} },
    { label: 'blank name', body: { name: ' \t\n ' } },
    { label: 'numeric name', body: { name: 42 } },
    { label: 'overlong name', body: { name: 'a'.repeat(201) } },
    { label: 'empty body', body: undefined },
    { label: 'null body', body: null },
    { label: 'array body', body: [{ name: 'Asha' }] },
  ])('returns JSON 422 for $label', async ({ body }) => {
    const response = await call('POST', await targetPath(), { body })

    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: expect.stringMatching(/\S/) })
  })

  it('returns JSON 422 for malformed JSON', async () => {
    const response = await exports.default.fetch(
      new Request(`http://localhost${await targetPath()}`, {
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
})

describe('home reads and member ordering', () => {
  it('stores trimmed home and member names', async () => {
    const home = await call<{ id: string; name: string }>('POST', '/api/homes', {
      body: { name: ' \tFlat 4B\n ' },
    })
    expect(home.status).toBe(201)
    expect(home.body.name).toBe('Flat 4B')

    const member = await call<Member>('POST', `/api/homes/${home.body.id}/members`, {
      body: { name: ' \tAsha\n ' },
    })
    expect(member.status).toBe(201)
    expect(member.body.name).toBe('Asha')

    const stored = await call<Home>('GET', `/api/homes/${home.body.id}`)
    expect(stored.status).toBe(200)
    expect(stored.body).toEqual({ id: home.body.id, name: 'Flat 4B', members: [member.body] })
  })

  it('returns five members in insertion order', async () => {
    const { homeId, members } = await createHome(['Zoya', 'Asha', 'Mina', 'Ben', 'Chitra'])

    const home = await call<Home>('GET', `/api/homes/${homeId}`)

    expect(home.status).toBe(200)
    expect(home.body.members).toEqual(members)
    expect(home.body.members.map((member) => member.name)).toEqual([
      'Zoya',
      'Asha',
      'Mina',
      'Ben',
      'Chitra',
    ])
  })

  it('returns an empty member list for a new home', async () => {
    const { homeId } = await createHome([])

    const home = await call<Home>('GET', `/api/homes/${homeId}`)

    expect(home.status).toBe(200)
    expect(home.body.members).toEqual([])
  })

  it('returns JSON 404 for a missing home', async () => {
    const home = await call('GET', '/api/homes/does-not-exist')

    expect(home.status).toBe(404)
    expect(home.body).toEqual({ error: 'home not found' })
  })

  it('validates member input before looking up the home', async () => {
    const response = await call('POST', '/api/homes/does-not-exist/members', { body: {} })

    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: expect.stringMatching(/\S/) })
  })
})
