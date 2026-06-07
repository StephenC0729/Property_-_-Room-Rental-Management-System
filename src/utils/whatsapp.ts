/**
 * Generates a wa.me WhatsApp deep link with a pre-filled receipt message.
 * The phone number must be in E.164 format without the '+' prefix (e.g. "60123456789").
 */
export function buildWhatsAppReceiptLink(params: {
  phone: string        // e.g. "+60123456789" or "60123456789"
  tenantName: string
  amount: number
  roomCode: string
  billingMonth: Date
}): string {
  const { phone, tenantName, amount, roomCode, billingMonth } = params

  // Strip leading '+' if present — wa.me requires no '+'
  const cleanPhone = phone.replace(/^\+/, '')

  const monthYear = billingMonth.toLocaleDateString('en-MY', {
    month: 'long',
    year: 'numeric',
  })

  const message =
    `Hi ${tenantName}, RM ${amount.toFixed(2)} payment received for Room ${roomCode} ` +
    `for the month of ${monthYear}. Thank you! - Management`

  const encoded = encodeURIComponent(message)
  return `https://wa.me/${cleanPhone}?text=${encoded}`
}

/**
 * Returns the current billing month as a Date (always day 1).
 * e.g. if today is 2026-06-07, returns 2026-06-01.
 */
export function getCurrentBillingMonth(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

/**
 * Formats a billing month date to "June 2026" style.
 */
export function formatBillingMonth(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })
}
