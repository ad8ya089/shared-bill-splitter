const dollars = new Intl.NumberFormat('en-US')

export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError('cents must be a nonnegative safe integer')
  }

  return `$${dollars.format(Math.trunc(cents / 100))}.${String(cents % 100).padStart(2, '0')}`
}

export function parseDollars(input: string): number | null {
  const text = input.trim()
  if (!/^(?:\d+|\d*\.\d{1,2})$/.test(text)) return null

  const [whole = '', fraction = ''] = text.split('.')
  const digits = `${whole || '0'}${fraction.padEnd(2, '0')}`
  // Build cents from digits to avoid rounding a decimal dollar value.
  let cents = 0
  for (const digit of digits) {
    cents = cents * 10 + (digit.charCodeAt(0) - 48)
    if (!Number.isSafeInteger(cents)) return null
  }

  return cents > 0 ? cents : null
}
