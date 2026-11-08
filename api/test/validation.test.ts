import { describe, expect, it } from 'vitest'
import { parseCreateNamed, parseName } from '../src/validation'

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
