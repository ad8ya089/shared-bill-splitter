export type Member = { id: string; homeId: string; name: string }
export type Home = { id: string; name: string; members: Member[] }
type Share = { id: string; memberId: string; amountCents: number; paidAt: string | null }
export type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}

type Result<T> = { ok: true; data: T } | { ok: false; message: string; status?: number }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNamed(value: unknown): value is Pick<Home, 'id' | 'name'> {
  return isRecord(value) && isText(value.id) && isText(value.name)
}

function isMember(value: unknown): value is Member {
  return isNamed(value) && 'homeId' in value && isText(value.homeId)
}

function isHome(value: unknown): value is Home {
  return (
    isNamed(value) &&
    'members' in value &&
    Array.isArray(value.members) &&
    value.members.every(isMember)
  )
}

function isCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isShare(value: unknown): value is Share {
  return (
    isRecord(value) &&
    isText(value.id) &&
    isText(value.memberId) &&
    isCents(value.amountCents) &&
    (value.paidAt === null || isText(value.paidAt))
  )
}

function isBill(value: unknown): value is Bill {
  return (
    isRecord(value) &&
    isText(value.id) &&
    isText(value.homeId) &&
    isText(value.title) &&
    isCents(value.totalCents) &&
    value.totalCents > 0 &&
    Array.isArray(value.shares) &&
    value.shares.every(isShare)
  )
}

function isBills(value: unknown): value is { bills: Bill[] } {
  return isRecord(value) && Array.isArray(value.bills) && value.bills.every(isBill)
}

async function request<T>(
  path: string[],
  guard: (value: unknown) => value is T,
  init: RequestInit = {},
  timeoutMs = 10000,
): Promise<Result<T>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let status: number | undefined
  try {
    const response = await fetch(`/api/${path.map(encodeURIComponent).join('/')}`, {
      ...init,
      signal: controller.signal,
    })
    status = response.status
    // Error pages can be HTML or empty; failed parsing must stay a result, not a crash.
    const text = await response.text()
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      body = undefined
    }
    if (!response.ok) {
      let message = 'the server sent an unexpected response'
      if (isRecord(body) && isText(body.error)) {
        message = body.error
      } else if (status >= 500) {
        message = 'the server had a problem, try again'
      }
      return { ok: false, message, status }
    }
    if (!guard(body))
      return { ok: false, message: 'the server sent an unexpected response', status }
    return { ok: true, data: body }
  } catch {
    return {
      ok: false,
      message: controller.signal.aborted
        ? 'the server took too long to answer'
        : 'could not reach the server',
      ...(status === undefined ? {} : { status }),
    }
  } finally {
    clearTimeout(timer)
  }
}

export function getHome(homeId: string, timeoutMs = 10000): Promise<Result<Home>> {
  return request(['homes', homeId], isHome, {}, timeoutMs)
}

export async function getBills(homeId: string): Promise<Result<Bill[]>> {
  const response = await request(['homes', homeId, 'bills'], isBills)
  if (!response.ok) return response
  return { ok: true, data: response.data.bills }
}

export function createHome(name: string): Promise<Result<Pick<Home, 'id' | 'name'>>> {
  return request(['homes'], isNamed, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export function addMember(homeId: string, name: string): Promise<Result<Member>> {
  return request(['homes', homeId, 'members'], isMember, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export function createBill(
  homeId: string,
  title: string,
  totalCents: number,
): Promise<Result<Bill>> {
  return request(['homes', homeId, 'bills'], isBill, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, totalCents }),
  })
}

export function payShare(billId: string, shareId: string, key: string): Promise<Result<Share>> {
  return request(['bills', billId, 'shares', shareId, 'pay'], isShare, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
  })
}
