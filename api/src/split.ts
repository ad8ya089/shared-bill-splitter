export function splitCents(totalCents: number, memberCount: number): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents < 1) {
    throw new RangeError('totalCents must be a positive safe integer')
  }
  if (!Number.isSafeInteger(memberCount) || memberCount < 1) {
    throw new RangeError('memberCount must be a positive safe integer')
  }

  const base = Math.floor(totalCents / memberCount)
  const extra = totalCents % memberCount

  return Array.from({ length: memberCount }, (_, i) => base + (i < extra ? 1 : 0))
}
