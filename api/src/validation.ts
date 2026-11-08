export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function parseName(value: unknown): ParseResult<string> {
  if (typeof value !== 'string') {
    return { ok: false, error: 'name must be a string' }
  }

  const name = value.trim()
  if (name.length < 1 || name.length > 200) {
    return { ok: false, error: 'name must be between 1 and 200 characters' }
  }

  return { ok: true, value: name }
}

export function parseCreateNamed(body: unknown): ParseResult<{ name: string }> {
  if (typeof body !== 'object' || body === null || Array.isArray(body) || !('name' in body)) {
    return { ok: false, error: 'body must be an object with a name' }
  }

  const name = parseName(body.name)
  if (!name.ok) return name

  return { ok: true, value: { name: name.value } }
}
