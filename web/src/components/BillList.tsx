import type { Bill, Member } from '../lib/api'
import { formatCents } from '../lib/money'

export function BillList({
  bills,
  members,
  pay,
  stateOf,
}: {
  bills: Bill[]
  members: Member[]
  pay: (billId: string, shareId: string) => Promise<void>
  stateOf: (
    shareId: string,
  ) => { status: 'idle' | 'paying' } | { status: 'failed'; message: string }
}) {
  const names = new Map(members.map((member) => [member.id, member.name]))
  return (
    <section aria-labelledby="bills-heading">
      <h2 id="bills-heading">Bills</h2>
      {bills.length === 0 ? (
        <p>No bills yet.</p>
      ) : (
        <ul className="bills">
          {bills.map((bill) => (
            <li key={bill.id} className="bill">
              <div className="bill-heading">
                <h3>{bill.title}</h3>
                <strong>{formatCents(bill.totalCents)}</strong>
              </div>
              <ul className="shares">
                {bill.shares.map((share) => {
                  const name = names.get(share.memberId) ?? 'Unknown member'
                  const amount = formatCents(share.amountCents)
                  const payment = stateOf(share.id)
                  const date = share.paidAt === null ? null : new Date(share.paidAt)
                  const action =
                    payment.status === 'failed'
                      ? 'Try again'
                      : payment.status === 'paying'
                        ? 'Paying...'
                        : 'Pay'
                  return (
                    <li key={share.id} className="share">
                      <div className="share-heading">
                        <span>{name}</span>
                        <strong>{amount}</strong>
                      </div>
                      <div className="share-status">
                        {share.paidAt !== null ? (
                          <span className="paid">
                            Paid
                            {date && !Number.isNaN(date.getTime()) && (
                              <>
                                {' '}
                                <time dateTime={date.toISOString()}>{date.toLocaleString()}</time>
                              </>
                            )}
                          </span>
                        ) : (
                          <>
                            <span>Unpaid</span>
                            <button
                              type="button"
                              disabled={payment.status === 'paying'}
                              aria-label={`${action} ${amount} for ${name}`}
                              onClick={() => {
                                void pay(bill.id, share.id)
                              }}
                            >
                              {action}
                            </button>
                          </>
                        )}
                      </div>
                      {payment.status === 'failed' && <p role="alert">{payment.message}</p>}
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
