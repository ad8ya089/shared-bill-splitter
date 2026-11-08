import { describe, expect, it } from 'vitest'
import { splitCents } from '../src/split'

describe('splitCents', () => {
  it.each([
    { total: 1000, members: 3, expected: [334, 333, 333] },
    { total: 2, members: 3, expected: [1, 1, 0] },
    { total: 3000, members: 3, expected: [1000, 1000, 1000] },
    { total: 1, members: 1, expected: [1] },
    { total: 1, members: 5, expected: [1, 0, 0, 0, 0] },
    { total: 100001, members: 7, expected: [14286, 14286, 14286, 14286, 14286, 14286, 14285] },
    { total: 4999, members: 1, expected: [4999] },
  ])('splits $total cents between $members members', ({ total, members, expected }) => {
    expect(splitCents(total, members)).toEqual(expected)
  })

  function expectInvariants(total: number, memberCount: number) {
    const shares = splitCents(total, memberCount)

    expect(shares).toHaveLength(memberCount)
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(total)
    expect(shares.every((share) => Number.isSafeInteger(share) && share >= 0)).toBe(true)
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1)
    expect(
      shares.every((share, index) => {
        const previous = shares[index - 1]
        return previous === undefined || previous >= share
      }),
    ).toBe(true)
  }

  it('preserves the split invariants for totals 1..500 and member counts 1..12', () => {
    for (let total = 1; total <= 500; total++) {
      for (let members = 1; members <= 12; members++) {
        expectInvariants(total, members)
      }
    }
  })

  it('preserves the split invariants for large safe integer totals', () => {
    for (const total of [
      999999999999,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER - 1,
      Number.MAX_SAFE_INTEGER - 12345,
    ]) {
      for (const members of [1, 2, 3, 7, 12, 37]) {
        expectInvariants(total, members)
      }
    }
  })

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid member count of %s',
    (members) => {
      expect(() => splitCents(1000, members)).toThrow(RangeError)
    },
  )

  it.each([0, -1, 10.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid total of %s',
    (total) => {
      expect(() => splitCents(total, 3)).toThrow(RangeError)
    },
  )
})
