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
