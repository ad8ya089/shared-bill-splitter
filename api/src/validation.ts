type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function parseIdempotencyKey(value: string | undefined): ParseResult<string> {
  const key = value?.trim()
  if (!key || key.length > 255) {
    return { ok: false, error: 'idempotency key must be 1 to 255 characters' }
  }

  return { ok: true, value: key }
}

function parseText(value: unknown, field: 'name' | 'title'): ParseResult<string> {
  if (typeof value !== 'string') {
    return { ok: false, error: `${field} must be a string` }
  }

  const text = value.trim()
  if (text.length < 1 || text.length > 200) {
    return { ok: false, error: `${field} must be between 1 and 200 characters` }
  }

  return { ok: true, value: text }
}

export function parseName(value: unknown): ParseResult<string> {
  return parseText(value, 'name')
}

export function parseCreateNamed(body: unknown): ParseResult<{ name: string }> {
  if (typeof body !== 'object' || body === null || Array.isArray(body) || !('name' in body)) {
    return { ok: false, error: 'body must be an object with a name' }
  }

  const name = parseName(body.name)
  if (!name.ok) return name

  return { ok: true, value: { name: name.value } }
}

export function parseTotalCents(value: unknown): ParseResult<number> {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    return { ok: false, error: 'totalCents must be a positive safe integer' }
  }

  return { ok: true, value }
}

export function parseCreateBill(body: unknown): ParseResult<{ title: string; totalCents: number }> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'body must be an object with a title and totalCents' }
  }

  const title = parseText('title' in body ? body.title : undefined, 'title')
  if (!title.ok) return title

  const totalCents = parseTotalCents('totalCents' in body ? body.totalCents : undefined)
  if (!totalCents.ok) return totalCents

  return { ok: true, value: { title: title.value, totalCents: totalCents.value } }
}
