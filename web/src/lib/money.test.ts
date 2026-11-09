import { describe, expect, it } from 'vitest'
import { formatCents, parseDollars } from './money'

describe('formatCents', () => {
  it.each([
    [0, '$0.00'],
    [5, '$0.05'],
    [99, '$0.99'],
    [100, '$1.00'],
    [334, '$3.34'],
    [100001, '$1,000.01'],
    [1000000, '$10,000.00'],
    [Number.MAX_SAFE_INTEGER, '$90,071,992,547,409.91'],
  ] satisfies [number, string][])('formats %s cents', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected)
  })
})

describe('parseDollars', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['0.99', 99],
    [' 7 ', 700],
    ['0.1', 10],
    ['.5', 50],
    ['90071992547409.91', Number.MAX_SAFE_INTEGER],
  ] satisfies [string, number][])('parses %s dollars', (input, expected) => {
    expect(parseDollars(input)).toBe(expected)
  })

  it.each(['', 'abc', '-5', '1.234', '1,000', '0', '0.00', '1e3', '12.', '90071992547409.92'])(
    'rejects %j',
    (input) => {
      expect(parseDollars(input)).toBeNull()
    },
  )
})
