import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addMember,
  type Bill,
  createBill,
  createHome,
  getBills,
  getHome,
  type Home,
  payShare,
} from '../lib/api'
import { pending } from '../testing/pending'
import { Page } from './Page'

vi.mock('../lib/api', () => ({
  getHome: vi.fn(),
  getBills: vi.fn(),
  createHome: vi.fn(),
  addMember: vi.fn(),
  createBill: vi.fn(),
  payShare: vi.fn(),
}))

const home: Home = {
  id: 'home',
  name: 'Flat 4B',
  members: [
    { id: 'asha', homeId: 'home', name: 'Asha' },
    { id: 'ben', homeId: 'home', name: 'Ben' },
    { id: 'chitra', homeId: 'home', name: 'Chitra' },
  ],
}
const bill: Bill = {
  id: 'bill',
  homeId: 'home',
  title: 'Electricity',
  totalCents: 1000,
  shares: [
    { id: 'first', memberId: 'asha', amountCents: 334, paidAt: null },
    { id: 'second', memberId: 'ben', amountCents: 333, paidAt: null },
    { id: 'third', memberId: 'chitra', amountCents: 333, paidAt: null },
  ],
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getHome).mockResolvedValue({ ok: true, data: home })
  vi.mocked(getBills).mockResolvedValue({ ok: true, data: [] })
  vi.mocked(createHome).mockResolvedValue({ ok: true, data: { id: 'new-home', name: 'Our home' } })
})

describe('page states', () => {
  it('shows the start form without a home id', () => {
    render(<Page homeId={undefined} openHome={vi.fn()} />)
    expect(screen.getByLabelText('Home name')).toBeInstanceOf(HTMLInputElement)
    expect(screen.getByLabelText('Home ID')).toBeInstanceOf(HTMLInputElement)
    expect(getHome).not.toHaveBeenCalled()
  })

  it('creates a home with Enter and opens its id', async () => {
    const openHome = vi.fn()
    const user = userEvent.setup()
    render(<Page homeId={undefined} openHome={openHome} />)
    await user.type(screen.getByLabelText('Home name'), '  Our home  {Enter}')
    expect(createHome).toHaveBeenCalledWith('Our home')
    expect(openHome).toHaveBeenCalledWith('new-home')
  })

  it('keeps the typed home name after a failed create', async () => {
    vi.mocked(createHome).mockResolvedValue({ ok: false, message: 'could not reach the server' })
    const user = userEvent.setup()
    render(<Page homeId={undefined} openHome={vi.fn()} />)
    await user.type(screen.getByLabelText('Home name'), 'Our home')
    await user.click(screen.getByRole('button', { name: 'Create home' }))
    expect(screen.getByRole('alert').textContent).toBe('could not reach the server')
    expect(screen.getByLabelText('Home name')).toHaveProperty('value', 'Our home')
    expect(screen.getByRole('button', { name: 'Create home' })).toHaveProperty('disabled', false)
  })

  it('opens a trimmed existing id and ignores an empty id', async () => {
    const openHome = vi.fn()
    const user = userEvent.setup()
    render(<Page homeId={undefined} openHome={openHome} />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(openHome).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Home ID'), '  saved-home  {Enter}')
    expect(openHome).toHaveBeenCalledWith('saved-home')
  })

  it('shows loading before the home arrives', async () => {
    const waiting = pending<Awaited<ReturnType<typeof getHome>>>()
    vi.mocked(getHome).mockReturnValue(waiting.promise)
    render(<Page homeId="home" openHome={vi.fn()} />)
    expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('status').textContent).toBe('Loading...')
    await act(async () => {
      waiting.finish({ ok: true, data: home })
    })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Flat 4B')
    expect(screen.getByText('home')).toBeInstanceOf(HTMLElement)
  })

  it('retries a failed load and recovers', async () => {
    vi.mocked(getBills).mockResolvedValueOnce({
      ok: false,
      message: 'the server had a problem, try again',
      status: 500,
    })
    const user = userEvent.setup()
    render(<Page homeId="home" openHome={vi.fn()} />)
    expect((await screen.findByRole('alert')).textContent).toBe(
      'the server had a problem, try again',
    )
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: 'Flat 4B' })
    expect(getHome).toHaveBeenCalledTimes(2)
    expect(getBills).toHaveBeenCalledTimes(2)
  })

  it('shows home not found and lets the user start over', async () => {
    vi.mocked(getHome).mockResolvedValue({ ok: false, message: 'home not found', status: 404 })
    const openHome = vi.fn()
    const user = userEvent.setup()
    render(<Page homeId="missing" openHome={openHome} />)
    await screen.findByRole('heading', { name: 'Home not found' })
    await user.click(screen.getByRole('button', { name: 'Start over' }))
    expect(openHome).toHaveBeenCalledWith(undefined)
  })

  it('shows the empty member sentence and no bill form', async () => {
    vi.mocked(getHome).mockResolvedValue({ ok: true, data: { ...home, members: [] } })
    render(<Page homeId="home" openHome={vi.fn()} />)
    await screen.findByText('No members yet.')
    expect(screen.getByText('Add a member before adding a bill')).toBeInstanceOf(HTMLElement)
    expect(screen.queryByLabelText('Bill title')).toBeNull()
  })

  it('shows members in order and an empty bills sentence', async () => {
    render(<Page homeId="home" openHome={vi.fn()} />)
    await screen.findByText('No bills yet.')
    expect(
      within(screen.getByRole('region', { name: 'Members' }))
        .getAllByRole('listitem')
        .map((entry) => entry.textContent),
    ).toEqual(['Asha', 'Ben', 'Chitra'])
    expect(screen.getByLabelText('Bill title')).toBeInstanceOf(HTMLInputElement)
  })

  it('shows paid and unpaid shares and an unknown member', async () => {
    vi.mocked(getBills).mockResolvedValue({
      ok: true,
      data: [
        {
          ...bill,
          shares: bill.shares.map((share, index) =>
            index === 0
              ? { ...share, paidAt: '2026-11-10T00:00:00.000Z' }
              : index === 2
                ? { ...share, memberId: 'missing' }
                : share,
          ),
        },
      ],
    })
    render(<Page homeId="home" openHome={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Electricity' })
    expect(screen.getByText(/^Paid/)).toBeInstanceOf(HTMLElement)
    expect(screen.queryByRole('button', { name: /for Asha/ })).toBeNull()
    expect(screen.getAllByText('Unpaid')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Pay $3.33 for Ben' })).toBeInstanceOf(
      HTMLButtonElement,
    )
    expect(screen.getByText('Unknown member')).toBeInstanceOf(HTMLElement)
  })

  it('shows only Paid when a paid timestamp is invalid', async () => {
    vi.mocked(getBills).mockResolvedValue({
      ok: true,
      data: [
        {
          ...bill,
          shares: [{ id: 'invalid-date', memberId: 'asha', amountCents: 1000, paidAt: 'invalid' }],
        },
      ],
    })
    render(<Page homeId="home" openHome={vi.fn()} />)
    expect(await screen.findByText('Paid')).toBeInstanceOf(HTMLElement)
    expect(screen.queryByRole('button', { name: /Pay/ })).toBeNull()
    expect(document.querySelector('time')).toBeNull()
  })
})

const paidShare = {
  id: 'first',
  memberId: 'asha',
  amountCents: 334,
  paidAt: '2026-11-10T00:00:00.000Z',
}
const paidBill: Bill = {
  ...bill,
  shares: bill.shares.map((share) => (share.id === 'first' ? paidShare : share)),
}

describe('page payments', () => {
  beforeEach(() => {
    vi.mocked(getBills).mockResolvedValue({ ok: true, data: [bill] })
  })

  it('shows Paying and only shows Paid after the server reload', async () => {
    const waiting = pending<Awaited<ReturnType<typeof payShare>>>()
    const refreshed = pending<Awaited<ReturnType<typeof getBills>>>()
    vi.mocked(payShare).mockReturnValue(waiting.promise)
    vi.mocked(getBills)
      .mockResolvedValueOnce({ ok: true, data: [bill] })
      .mockReturnValueOnce(refreshed.promise)
    const user = userEvent.setup()
    render(<Page homeId="home" openHome={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Pay $3.34 for Asha' }))
    expect(screen.getByRole('button', { name: /Paying.*for Asha/ })).toHaveProperty(
      'disabled',
      true,
    )
    expect(screen.getByRole('button', { name: 'Pay $3.33 for Ben' })).toHaveProperty(
      'disabled',
      false,
    )
    await act(async () => {
      waiting.finish({ ok: true, data: paidShare })
    })
    expect(screen.getByText('Refreshing...').getAttribute('aria-live')).toBe('polite')
    expect(screen.getAllByText('Unpaid')).toHaveLength(3)
    expect(screen.queryByText(/^Paid/)).toBeNull()
    await act(async () => {
      refreshed.finish({ ok: true, data: [paidBill] })
    })
    expect(screen.getByText(/^Paid/)).toBeInstanceOf(HTMLElement)
    expect(screen.queryByRole('button', { name: /for Asha/ })).toBeNull()
  })

  it('keeps a timed-out share unpaid and retries with the same key', async () => {
    const retry = pending<Awaited<ReturnType<typeof payShare>>>()
    vi.mocked(payShare)
      .mockResolvedValueOnce({ ok: false, message: 'the server took too long to answer' })
      .mockReturnValueOnce(retry.promise)
    vi.mocked(getBills)
      .mockResolvedValueOnce({ ok: true, data: [bill] })
      .mockResolvedValue({ ok: true, data: [paidBill] })
    const user = userEvent.setup()
    render(<Page homeId="home" openHome={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Pay $3.34 for Asha' }))
    expect(screen.getByRole('alert').textContent).toBe('the server took too long to answer')
    expect(screen.getAllByText('Unpaid')).toHaveLength(3)
    expect(getBills).toHaveBeenCalledTimes(1)
    const retryButton = screen.getByRole('button', { name: 'Try again $3.34 for Asha' })
    expect(retryButton).toHaveProperty('disabled', false)
    await user.click(retryButton)
    expect(payShare).toHaveBeenCalledTimes(2)
    expect(vi.mocked(payShare).mock.calls[1]).toEqual(vi.mocked(payShare).mock.calls[0])
    await act(async () => {
      retry.finish({ ok: true, data: paidShare })
    })
    await screen.findByText(/^Paid/)
  })

  it('shows a conflict message and refreshes the paid share', async () => {
    const refreshed = pending<Awaited<ReturnType<typeof getBills>>>()
    vi.mocked(payShare).mockResolvedValue({ ok: false, status: 409, message: 'share already paid' })
    vi.mocked(getBills)
      .mockResolvedValueOnce({ ok: true, data: [bill] })
      .mockReturnValueOnce(refreshed.promise)
    const user = userEvent.setup()
    render(<Page homeId="home" openHome={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Pay $3.34 for Asha' }))
    expect(screen.getByRole('alert').textContent).toBe('already paid')
    expect(getBills).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Refreshing...')).toBeInstanceOf(HTMLElement)
    await act(async () => {
      refreshed.finish({ ok: true, data: [paidBill] })
    })
    expect(screen.getByText(/^Paid/)).toBeInstanceOf(HTMLElement)
    expect(screen.queryByRole('button', { name: /for Asha/ })).toBeNull()
  })

  it('sends one request for a double click', async () => {
    const waiting = pending<Awaited<ReturnType<typeof payShare>>>()
    vi.mocked(payShare).mockReturnValue(waiting.promise)
    const user = userEvent.setup()
    render(<Page homeId="home" openHome={vi.fn()} />)
    await user.dblClick(await screen.findByRole('button', { name: 'Pay $3.34 for Asha' }))
    expect(payShare).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Paying.*for Asha/ })).toHaveProperty(
      'disabled',
      true,
    )
    await act(async () => {
      waiting.finish({ ok: false, message: 'network unavailable' })
    })
  })

  it('pays two shares independently and leaves the third button available', async () => {
    const first = pending<Awaited<ReturnType<typeof payShare>>>()
    const second = pending<Awaited<ReturnType<typeof payShare>>>()
    vi.mocked(payShare).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const user = userEvent.setup()
    render(<Page homeId="home" openHome={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Pay $3.34 for Asha' }))
    await user.click(screen.getByRole('button', { name: 'Pay $3.33 for Ben' }))
    expect(screen.getAllByRole('button', { name: /Paying/ })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Pay $3.33 for Chitra' })).toHaveProperty(
      'disabled',
      false,
    )
    expect(vi.mocked(payShare).mock.calls[0]?.[2]).not.toBe(vi.mocked(payShare).mock.calls[1]?.[2])
    await act(async () => {
      first.finish({ ok: false, message: 'network unavailable' })
    })
    expect(screen.getByRole('button', { name: /Paying.*for Ben/ })).toHaveProperty('disabled', true)
    await act(async () => {
      second.finish({ ok: false, message: 'network unavailable' })
    })
  })
})

describe('member and bill forms', () => {
  it('adds a member with Enter, clears the field and reloads the names', async () => {
    const added = { id: 'dev', homeId: 'home', name: 'Dev' }
    vi.mocked(addMember).mockResolvedValue({ ok: true, data: added })
    vi.mocked(getHome)
      .mockResolvedValueOnce({ ok: true, data: home })
      .mockResolvedValue({ ok: true, data: { ...home, members: [...home.members, added] } })
    const user = userEvent.setup()
    render(<Page homeId="home" openHome={vi.fn()} />)
    const field = await screen.findByLabelText('Member name')
    await user.type(field, '  Dev  {Enter}')
    expect(addMember).toHaveBeenCalledWith('home', 'Dev')
    await screen.findByText('Dev')
    expect(field).toHaveProperty('value', '')
    expect(getHome).toHaveBeenCalledTimes(2)
  })

  it('keeps the member name and shows a failed request', async () => {
    vi.mocked(addMember).mockResolvedValue({ ok: false, message: 'could not reach the server' })
    const user = userEvent.setup()
    render(<Page homeId="home" openHome={vi.fn()} />)
    const field = await screen.findByLabelText('Member name')
    await user.type(field, 'Dev')
    await user.click(screen.getByRole('button', { name: 'Add member' }))
    expect(screen.getByRole('alert').textContent).toBe('could not reach the server')
    expect(field).toHaveProperty('value', 'Dev')
    expect(screen.getByRole('button', { name: 'Add member' })).toHaveProperty('disabled', false)
    expect(getHome).toHaveBeenCalledTimes(1)
  })

  it('rejects a blank member name without calling the API', async () => {
    const user = userEvent.setup()
    render(<Page homeId="home" openHome={vi.fn()} />)
    await user.type(await screen.findByLabelText('Member name'), '   ')
    await user.click(screen.getByRole('button', { name: 'Add member' }))
    expect(screen.getByRole('alert').textContent).toBe('enter a member name')
    expect(addMember).not.toHaveBeenCalled()
  })

  it.each(['', 'abc', '0', '-5', '1.234', '1e3', '1,000'])(
    'rejects the bill amount %j without calling the API',
    async (amount) => {
      const user = userEvent.setup()
      render(<Page homeId="home" openHome={vi.fn()} />)
      await user.type(await screen.findByLabelText('Bill title'), 'Rent')
      const field = screen.getByLabelText('Amount (USD)')
      expect(field.getAttribute('inputmode')).toBe('decimal')
      if (amount) await user.type(field, amount)
      await user.click(screen.getByRole('button', { name: 'Add bill' }))
      expect(screen.getByRole('alert').textContent).toContain('positive amount')
      expect(createBill).not.toHaveBeenCalled()
    },
  )

  it('rejects a blank bill title without calling the API', async () => {
    const user = userEvent.setup()
    render(<Page homeId="home" openHome={vi.fn()} />)
    await user.type(await screen.findByLabelText('Bill title'), '   ')
    await user.type(screen.getByLabelText('Amount (USD)'), '12.50')
    await user.click(screen.getByRole('button', { name: 'Add bill' }))
    expect(screen.getByRole('alert').textContent).toBe('enter a bill title')
    expect(createBill).not.toHaveBeenCalled()
  })

  it('submits integer cents and a trimmed title once, disables the button and clears on success', async () => {
    const waiting = pending<Awaited<ReturnType<typeof createBill>>>()
    const created = { ...bill, id: 'rent', title: 'Rent', totalCents: 1250 }
    vi.mocked(createBill).mockReturnValue(waiting.promise)
    vi.mocked(getBills)
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockResolvedValue({ ok: true, data: [created] })
    const user = userEvent.setup()
    render(<Page homeId="home" openHome={vi.fn()} />)
    const title = await screen.findByLabelText('Bill title')
    const amount = screen.getByLabelText('Amount (USD)')
    await user.type(title, '  Rent  ')
    await user.type(amount, '12.50')
    await user.dblClick(screen.getByRole('button', { name: 'Add bill' }))
    expect(createBill).toHaveBeenCalledExactlyOnceWith('home', 'Rent', 1250)
    expect(screen.getByRole('button', { name: 'Adding...' })).toHaveProperty('disabled', true)
    expect(title).toHaveProperty('value', '  Rent  ')
    expect(amount).toHaveProperty('value', '12.50')
    await act(async () => {
      waiting.finish({ ok: true, data: created })
    })
    await screen.findByRole('heading', { name: 'Rent' })
    expect(title).toHaveProperty('value', '')
    expect(amount).toHaveProperty('value', '')
    expect(getBills).toHaveBeenCalledTimes(2)
  })

  it('keeps both bill fields after failure and allows another attempt', async () => {
    vi.mocked(createBill).mockResolvedValue({ ok: false, message: 'could not reach the server' })
    const user = userEvent.setup()
    render(<Page homeId="home" openHome={vi.fn()} />)
    const title = await screen.findByLabelText('Bill title')
    const amount = screen.getByLabelText('Amount (USD)')
    await user.type(title, 'Rent')
    await user.type(amount, '12.50{Enter}')
    expect(createBill).toHaveBeenCalledWith('home', 'Rent', 1250)
    expect(screen.getByRole('alert').textContent).toBe('could not reach the server')
    expect(title).toHaveProperty('value', 'Rent')
    expect(amount).toHaveProperty('value', '12.50')
    expect(screen.getByRole('button', { name: 'Add bill' })).toHaveProperty('disabled', false)
  })

  it('does not create two homes from a double click', async () => {
    const waiting = pending<Awaited<ReturnType<typeof createHome>>>()
    vi.mocked(createHome).mockReturnValue(waiting.promise)
    const openHome = vi.fn()
    const user = userEvent.setup()
    render(<Page homeId={undefined} openHome={openHome} />)
    await user.type(screen.getByLabelText('Home name'), 'Our home')
    await user.dblClick(screen.getByRole('button', { name: 'Create home' }))
    expect(createHome).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Creating...' })).toHaveProperty('disabled', true)
    await act(async () => {
      waiting.finish({ ok: true, data: { id: 'new-home', name: 'Our home' } })
    })
    expect(openHome).toHaveBeenCalledExactlyOnceWith('new-home')
  })

  it('does not add a member twice while a request is pending', async () => {
    const waiting = pending<Awaited<ReturnType<typeof addMember>>>()
    vi.mocked(addMember).mockReturnValue(waiting.promise)
    const user = userEvent.setup()
    render(<Page homeId="home" openHome={vi.fn()} />)
    await user.type(await screen.findByLabelText('Member name'), 'Dev')
    await user.dblClick(screen.getByRole('button', { name: 'Add member' }))
    expect(addMember).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Adding...' })).toHaveProperty('disabled', true)
    await act(async () => {
      waiting.finish({ ok: false, message: 'network unavailable' })
    })
  })
})
