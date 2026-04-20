import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tenderwatch.dk'

export interface AlertTender {
  id: string
  title: string
  buyer_name: string | null
  buyer_country: string | null
  estimated_value_eur: number | null
  submission_deadline: string | null
  cpv_codes: string[]
  relevance_score: number
  ai_reason: string | null
  profile_name: string
}

function formatValue(v: number | null): string {
  if (!v) return ''
  return `€${v.toLocaleString('en-EU', { maximumFractionDigits: 0 })}`
}

function formatDeadline(d: string | null): string {
  if (!d) return 'No deadline specified'
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return d }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildAlertHtml(userName: string, tenders: AlertTender[]): string {
  const cards = tenders.map(t => {
    const url = `${APP_URL}/feed`
    const value = formatValue(t.estimated_value_eur)
    const deadline = formatDeadline(t.submission_deadline)
    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-left:4px solid #22c55e;border-radius:8px;overflow:hidden;margin-bottom:16px;">
      <tr>
        <td style="padding:16px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;background:#dcfce7;color:#166534;margin-bottom:8px;">SCORE ${Math.round(t.relevance_score)} · ${escapeHtml(t.profile_name)}</span>
              </td>
            </tr>
            <tr>
              <td>
                <a href="${url}" style="color:#111827;font-size:16px;font-weight:700;text-decoration:none;line-height:1.3;">${escapeHtml(t.title)}</a>
              </td>
            </tr>
          </table>
          <p style="margin:8px 0 0 0;font-size:13px;color:#6b7280;">
            ${escapeHtml(t.buyer_name || 'Unknown buyer')}${t.buyer_country ? ` · ${escapeHtml(t.buyer_country)}` : ''}${value ? ` · ${value}` : ''}
          </p>
          <p style="margin:4px 0 0 0;font-size:12px;color:#9ca3af;">Deadline: ${deadline}</p>
          ${t.ai_reason ? `<p style="margin:10px 0 0 0;font-size:13px;color:#2563eb;font-style:italic;line-height:1.4;">✦ ${escapeHtml(t.ai_reason)}</p>` : ''}
          <p style="margin:12px 0 0 0;">
            <a href="${url}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:13px;font-weight:600;padding:8px 20px;border-radius:6px;text-decoration:none;">View in feed →</a>
          </p>
        </td>
      </tr>
    </table>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>TenderWatch Alert</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <tr><td style="padding:0 20px 20px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><h1 style="margin:0;font-size:20px;font-weight:700;color:#111827;">TenderWatch</h1></td>
              <td align="right"><span style="font-size:12px;font-weight:600;color:#16a34a;">⚡ High-match alert</span></td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:0 20px 20px 20px;">
          <p style="margin:0 0 4px 0;font-size:15px;color:#111827;">Hi ${escapeHtml(userName)},</p>
          <p style="margin:0;font-size:14px;color:#6b7280;">
            We found <strong style="color:#111827;">${tenders.length} high-relevance tender${tenders.length !== 1 ? 's' : ''}</strong> scoring 80 or above — too good to wait until tomorrow.
          </p>
        </td></tr>

        <tr><td style="padding:0 20px;">${cards}</td></tr>

        <tr><td style="padding:16px 20px 0 20px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;line-height:1.5;">
            You receive these alerts for matches scoring 80+. Your daily digest continues as normal.<br>
            <a href="${APP_URL}/settings" style="color:#6b7280;text-decoration:underline;">Manage preferences</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function buildAlertText(userName: string, tenders: AlertTender[]): string {
  let body = `Hi ${userName},\n\nHigh-relevance tender alert — ${tenders.length} match${tenders.length !== 1 ? 'es' : ''} scoring 80+:\n\n`
  for (const t of tenders) {
    body += `[${Math.round(t.relevance_score)}] ${t.title}\n`
    body += `  ${t.buyer_name || 'Unknown buyer'}${t.buyer_country ? ` · ${t.buyer_country}` : ''}${formatValue(t.estimated_value_eur) ? ` · ${formatValue(t.estimated_value_eur)}` : ''}\n`
    body += `  Deadline: ${formatDeadline(t.submission_deadline)}\n`
    if (t.ai_reason) body += `  → ${t.ai_reason}\n`
    body += '\n'
  }
  body += `View in feed: ${APP_URL}/feed\n\nTenderWatch · ${APP_URL}/settings`
  return body
}

export async function sendHighMatchAlert(params: {
  to: string
  userName: string
  tenders: AlertTender[]
}) {
  const { to, userName, tenders } = params
  const count = tenders.length
  const topTitle = tenders[0]?.title || 'new tender'
  const subject = count === 1
    ? `⚡ High match: ${topTitle}`
    : `⚡ ${count} high-match tenders found`

  const { error } = await getResend().emails.send({
    from: 'TenderWatch <onboarding@resend.dev>',
    to,
    subject,
    html: buildAlertHtml(userName, tenders),
    text: buildAlertText(userName, tenders),
  })

  if (error) {
    console.error('Failed to send alert email:', error)
    throw error
  }
}
