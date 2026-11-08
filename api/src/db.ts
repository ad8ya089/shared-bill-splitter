export type HomeRow = {
  id: string
  name: string
  created_at: string
}

export type MemberRow = {
  seq: number
  id: string
  home_id: string
  name: string
  created_at: string
}

export type BillRow = {
  seq: number
  id: string
  home_id: string
  title: string
  total_cents: number
  created_at: string
}

export type ShareRow = {
  seq: number
  id: string
  bill_id: string
  member_id: string
  amount_cents: number
  paid_at: string | null
  paid_idempotency_key: string | null
}

export type BillShare = {
  id: string
  memberId: string
  amountCents: number
  paidAt: string | null
}

export type BillWithShares = {
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
  const { results } = await db
    .prepare(
      'SELECT seq, id, home_id, name, created_at FROM members WHERE home_id = ? ORDER BY seq',
    )
    .bind(homeId)
    .all<MemberRow>()

  return results
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
  const insertShare = db.prepare(
    'INSERT INTO shares (id, bill_id, member_id, amount_cents) VALUES (?, ?, ?, ?)',
  )

  return db.batch([
    insertBill,
    ...bill.shares.map((share) =>
      insertShare.bind(share.id, bill.id, share.memberId, share.amountCents),
    ),
  ])
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

  const byId = new Map<string, BillWithShares>()
  for (const bill of bills) {
    byId.set(bill.id, {
      id: bill.id,
      homeId: bill.home_id,
      title: bill.title,
      totalCents: bill.total_cents,
      shares: [],
    })
  }
  for (const share of shares) {
    const bill = byId.get(share.bill_id)
    if (bill) {
      bill.shares.push({
        id: share.id,
        memberId: share.member_id,
        amountCents: share.amount_cents,
        paidAt: share.paid_at,
      })
    }
  }

  return [...byId.values()]
}
