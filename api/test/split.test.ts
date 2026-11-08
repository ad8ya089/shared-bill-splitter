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
})
