type HomeRow = {
  id: string
  name: string
  created_at: string
}

type MemberRow = {
  seq: number
  id: string
  home_id: string
  name: string
  created_at: string
}

type BillRow = {
  seq: number
  id: string
  home_id: string
  title: string
  total_cents: number
  created_at: string
}

type ShareRow = {
  seq: number
  id: string
  bill_id: string
  member_id: string
  amount_cents: number
  paid_at: string | null
  paid_idempotency_key: string | null
}

type BillShare = {
  id: string
  memberId: string
  amountCents: number
  paidAt: string | null
}

type BillWithShares = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: BillShare[]
}

export function insertHome(db: D1Database, home: HomeRow) {
  return db
    .prepare('INSERT INTO homes (id, name, created_at) VALUES (?, ?, ?)')
    .bind(home.id, home.name, home.created_at)
    .run()
}

export function insertMember(db: D1Database, member: Omit<MemberRow, 'seq'>) {
  return db
    .prepare('INSERT INTO members (id, home_id, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(member.id, member.home_id, member.name, member.created_at)
    .run()
}

export function findHome(db: D1Database, id: string): Promise<HomeRow | null> {
  return db.prepare('SELECT id, name, created_at FROM homes WHERE id = ?').bind(id).first<HomeRow>()
}

export async function listMembers(db: D1Database, homeId: string): Promise<MemberRow[]> {
  const { results: members } = await db
    .prepare(
      'SELECT seq, id, home_id, name, created_at FROM members WHERE home_id = ? ORDER BY seq',
    )
    .bind(homeId)
    .all<MemberRow>()

  return members
}

export function createBillWithShares(
  db: D1Database,
  bill: Omit<BillWithShares, 'shares'> & { shares: Omit<BillShare, 'paidAt'>[] },
) {
  const insertBill = db
    .prepare(
      'INSERT INTO bills (id, home_id, title, total_cents, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(bill.id, bill.homeId, bill.title, bill.totalCents, new Date().toISOString())
  // One JSON parameter keeps share queries constant; the batch saves everything or nothing.
  const insertShares = db
    .prepare(
      `INSERT INTO shares (id, bill_id, member_id, amount_cents)
       SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.memberId'),
              json_extract(value, '$.amountCents') FROM json_each(?)`,
    )
    .bind(bill.id, JSON.stringify(bill.shares))

  return db.batch([insertBill, insertShares])
}

export async function listBillsWithShares(
  db: D1Database,
  homeId: string,
): Promise<BillWithShares[]> {
  const { results: bills } = await db
    .prepare(
      `SELECT b.seq, b.id, b.home_id, b.title, b.total_cents, b.created_at
       FROM bills AS b WHERE b.home_id = ? ORDER BY b.seq DESC`,
    )
    .bind(homeId)
    .all<BillRow>()
  const { results: shares } = await db
    .prepare(
      `SELECT s.* FROM shares AS s
       JOIN bills AS b ON b.id = s.bill_id
       JOIN members AS m ON m.id = s.member_id
       WHERE b.home_id = ? ORDER BY b.seq DESC, m.seq`,
    )
    .bind(homeId)
    .all<ShareRow>()

  const billsById = new Map<string, BillWithShares>()
  for (const bill of bills) {
    billsById.set(bill.id, {
      id: bill.id,
      homeId: bill.home_id,
      title: bill.title,
      totalCents: bill.total_cents,
      shares: [],
    })
  }
  for (const share of shares) {
    const bill = billsById.get(share.bill_id)
    if (bill) {
      bill.shares.push({
        id: share.id,
        memberId: share.member_id,
        amountCents: share.amount_cents,
        paidAt: share.paid_at,
      })
    }
  }

  return [...billsById.values()]
}

export async function payShare(
  db: D1Database,
  billId: string,
  shareId: string,
  key: string,
): Promise<
  | { status: 'paid' | 'replayed'; share: BillShare }
  | { status: 'already paid' }
  | { status: 'missing' }
> {
  // Only the unpaid row can win; a separate read before writing would race.
  const payment = await db
    .prepare(
      `UPDATE shares SET paid_at = ?, paid_idempotency_key = ?
       WHERE id = ? AND bill_id = ? AND paid_at IS NULL`,
    )
    .bind(new Date().toISOString(), key, shareId, billId)
    .run()
  const share = await db
    .prepare('SELECT * FROM shares WHERE id = ? AND bill_id = ?')
    .bind(shareId, billId)
    .first<ShareRow>()

  if (!share) return { status: 'missing' }
  if (payment.meta.changes === 0 && share.paid_idempotency_key !== key) {
    return { status: 'already paid' }
  }

  return {
    // With no changed row, a matching key means the first attempt already won.
    status: payment.meta.changes === 1 ? 'paid' : 'replayed',
    share: {
      id: share.id,
      memberId: share.member_id,
      amountCents: share.amount_cents,
      paidAt: share.paid_at,
    },
  }
}

type BalanceRow = { memberId: string; name: string; outstandingCents: number }

export async function listBalances(db: D1Database, homeId: string): Promise<BalanceRow[]> {
  const { results: balances } = await db
    .prepare(
      `SELECT m.id AS memberId, m.name AS name,
              COALESCE(SUM(CASE WHEN s.paid_at IS NULL THEN s.amount_cents END), 0) AS outstandingCents
       FROM members m
       LEFT JOIN shares s ON s.member_id = m.id
       WHERE m.home_id = ?
       GROUP BY m.id
       ORDER BY m.seq`,
    )
    .bind(homeId)
    .all<BalanceRow>()

  // Refuse a rounded balance rather than returning a silently wrong amount.
  for (const balance of balances) {
    if (!Number.isSafeInteger(balance.outstandingCents)) {
      throw new RangeError('outstanding cents exceed the safe integer range')
    }
  }

  return balances
}
