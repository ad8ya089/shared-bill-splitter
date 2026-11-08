import { describe, expect, it } from 'vitest'
import {
  parseCreateBill,
  parseCreateNamed,
  parseIdempotencyKey,
  parseName,
  parseTotalCents,
} from '../src/validation'

const validNames = [
  { label: 'a valid name', input: 'Flat 4B', expected: 'Flat 4B' },
  { label: 'a padded name', input: ' \tFlat 4B\n ', expected: 'Flat 4B' },
  { label: '200 characters', input: 'a'.repeat(200), expected: 'a'.repeat(200) },
  { label: '200 padded characters', input: ` ${'a'.repeat(200)} `, expected: 'a'.repeat(200) },
]

const invalidNames = [
  { label: 'an empty string', input: '' },
  { label: 'whitespace', input: ' \t\n ' },
  { label: '201 characters', input: 'a'.repeat(201) },
  { label: 'a number', input: 42 },
  { label: 'null', input: null },
  { label: 'an array', input: ['Flat 4B'] },
  { label: 'undefined', input: undefined },
]

describe('parseName', () => {
  it.each(validNames)('accepts $label', ({ input, expected }) => {
    expect(parseName(input)).toEqual({ ok: true, value: expected })
  })

  it.each(invalidNames)('rejects $label', ({ input }) => {
    expect(parseName(input)).toEqual({ ok: false, error: expect.stringMatching(/\S/) })
  })
})

describe('parseCreateNamed', () => {
  it.each(validNames)('accepts $label', ({ input, expected }) => {
    expect(parseCreateNamed({ name: input })).toEqual({ ok: true, value: { name: expected } })
  })

  it.each(invalidNames)('rejects a name that is $label', ({ input }) => {
    expect(parseCreateNamed({ name: input })).toEqual({
      ok: false,
      error: expect.stringMatching(/\S/),
    })
  })

  it.each([
    { label: 'null', body: null },
    { label: 'undefined', body: undefined },
    { label: 'a string', body: 'Flat 4B' },
    { label: 'a number', body: 42 },
    { label: 'a boolean', body: true },
    { label: 'an array', body: [{ name: 'Flat 4B' }] },
    { label: 'an object without a name', body: {} },
  ])('rejects $label as the body', ({ body }) => {
    expect(parseCreateNamed(body)).toEqual({ ok: false, error: expect.stringMatching(/\S/) })
  })
})

const invalidAmounts = [
  { label: 'zero', input: 0 },
  { label: 'a negative amount', input: -100 },
  { label: 'a fractional amount', input: 10.5 },
  { label: 'a numeric string', input: '1000' },
  { label: 'null', input: null },
  { label: 'undefined', input: undefined },
  { label: 'NaN', input: NaN },
  { label: 'Infinity', input: Infinity },
  { label: 'a huge number', input: 1e300 },
  { label: 'an unsafe integer', input: Number.MAX_SAFE_INTEGER + 1 },
]

describe('parseTotalCents', () => {
  it.each([1, Number.MAX_SAFE_INTEGER])('accepts %s', (amount) => {
    expect(parseTotalCents(amount)).toEqual({ ok: true, value: amount })
  })

  it.each(invalidAmounts)('rejects $label', ({ input }) => {
    expect(parseTotalCents(input)).toEqual({
      ok: false,
      error: expect.stringMatching(/totalCents/),
    })
  })
})

describe('parseCreateBill', () => {
  it.each([1, Number.MAX_SAFE_INTEGER])('accepts %s cents and trims the title', (totalCents) => {
    expect(parseCreateBill({ title: ' \tElectricity\n ', totalCents })).toEqual({
      ok: true,
      value: { title: 'Electricity', totalCents },
    })
  })

  it('accepts a 200-character title', () => {
    const title = 'a'.repeat(200)
    expect(parseCreateBill({ title, totalCents: 1 })).toEqual({
      ok: true,
      value: { title, totalCents: 1 },
    })
  })

  it.each(invalidAmounts)('rejects $label as totalCents', ({ input }) => {
    expect(parseCreateBill({ title: 'Electricity', totalCents: input })).toEqual({
      ok: false,
      error: expect.stringMatching(/totalCents/),
    })
  })

  it.each(invalidNames)('rejects $label as the title', ({ input }) => {
    expect(parseCreateBill({ title: input, totalCents: 1000 })).toEqual({
      ok: false,
      error: expect.stringMatching(/title/),
    })
  })

  it.each([
    { label: 'undefined', body: undefined },
    { label: 'null', body: null },
    { label: 'an array', body: [{ title: 'Electricity', totalCents: 1 }] },
    { label: 'a string', body: 'Electricity' },
    { label: 'a number', body: 1 },
    { label: 'a boolean', body: true },
    { label: 'an empty object', body: {} },
    { label: 'a missing title', body: { totalCents: 1 } },
    { label: 'a missing amount', body: { title: 'Electricity' } },
  ])('rejects $label as the body', ({ body }) => {
    expect(parseCreateBill(body)).toEqual({ ok: false, error: expect.stringMatching(/\S/) })
  })
})

describe('parseIdempotencyKey', () => {
  it.each([undefined, '', '   ', 'a'.repeat(256)])('rejects the key %j', (key) => {
    expect(parseIdempotencyKey(key)).toEqual({ ok: false, error: expect.any(String) })
  })

  it('trims a padded key', () => {
    expect(parseIdempotencyKey('  payment-key  ')).toEqual({ ok: true, value: 'payment-key' })
  })

  it('accepts 255 characters', () => {
    const key = 'a'.repeat(255)
    expect(parseIdempotencyKey(key)).toEqual({ ok: true, value: key })
  })
})
