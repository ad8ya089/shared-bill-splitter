import type { Context } from 'hono'
import type { ClientErrorStatusCode, ServerErrorStatusCode } from 'hono/utils/http-status'

export function jsonError(
  c: Context<{ Bindings: Env }>,
  status: ClientErrorStatusCode | ServerErrorStatusCode,
  message: string,
) {
  return c.json({ error: message }, status)
}

export async function readJsonBody(c: Context<{ Bindings: Env }>): Promise<unknown> {
  try {
    return await c.req.json<unknown>()
  } catch {
    return undefined
  }
}
