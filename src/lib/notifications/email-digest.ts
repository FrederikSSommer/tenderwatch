import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tenderwatch.dk'

interface DigestTender {
  id: string
  title: string
  buyer_name: string | null
  buyer_country: string | null
  estimated_value_eur: number | null
  submission_deadline: string | null
  relevance_score: number
  cpv_codes: string[]
  ai_reason: string | null
}

interface DigestParams {
  to: string
  userName: string
  profileName: string
  tenders: DigestTender[]
}

function formatValue(v: number | null): string {
  if (!v) return ''
  return `€${v.toLocaleString('en-EU', { maximumFractionDigits: 0 })}`
}

function formatDeadline(d: string | null): string {
  if (!d) return 'Not specified'
  try {
    return new Date(d).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return d
  }
}

function scoreColor(score: number): { bg: string; text: string; dot: string } {
  if (score >= 80) return { bg: '#dcfce7', text: '#166534', dot: '#22c55e' }
  if (score >= 40) return { bg: '#fef9c3', text: '#854d0e', dot: '#eab308' }
  return { bg: '#f3f4f6', text: '#374151', dot: '#9ca3af' }
}

function renderTenderCard(t: DigestTender): string {
  const colors = scoreColor(t.relevance_score)
  const value = formatValue(t.estimated_value_eur)
  const deadline = formatDeadline(t.submission_deadline)
  const tenderUrl = `${APP_URL}/tender/${t.id}`

  return `
    <tr>
      <td style="padding: 0 0 16px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="padding: 16px 20px;">
              <!-- Score + Title -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td width="14" style="vertical-align: middle;">
                    <div style="width: 10px; height: 10px; border-radius: 50%; background: ${colors.dot};"></div>
                  </td>
                  <td width="40" style="vertical-align: middle; padding-left: 6px;">
                    <span style="display: inline-block; font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 4px; background: ${colors.bg}; color: ${colors.text};">${Math.round(t.relevance_score)}</span>
                  </td>
                  <td style="vertical-align: middle; padding-left: 8px;">
                    <a href="${tenderUrl}" style="color: #111827; font-size: 15px; font-weight: 600; text-decoration: none;">${escapeHtml(t.title)}</a>
                  </td>
                </tr>
              </table>

              <!-- Buyer + Value -->
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #6b7280; line-height: 1.4;">
                ${escapeHtml(t.buyer_name || 'Unknown buyer')}${t.buyer_country ? ` · ${escapeHtml(t.buyer_country)}` : ''}${value ? ` · ${value}` : ''}
              </p>

              <!-- Deadline -->
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #9ca3af;">
                Deadline: ${deadline}
              </p>

              <!-- AI Reason -->
              ${t.ai_reason ? `
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #2563eb; font-style: italic; line-height: 1.4;">
                ✦ ${escapeHtml(t.ai_reason)}
              </p>
              ` : ''}

              <!-- CTA -->
              <p style="margin: 10px 0 0 0;">
                <a href="${tenderUrl}" style="display: inline-block; font-size: 12px; font-weight: 500; color: #2563eb; text-decoration: none; border: 1px solid #dbeafe; border-radius: 6px; padding: 4px 12px;">View tender →</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildHtml(params: DigestParams): string {
  const { userName, profileName, tenders } = params
  const highRelevance = tenders.filter((t) => t.relevance_score >= 80)
  const mediumRelevance = tenders.filter((t) => t.relevance_score >= 40 && t.relevance_score < 80)
  const lowRelevance = tenders.filter((t) => t.relevance_score < 40)

  function renderSection(title: string, items: DigestTender[]): string {
    if (items.length === 0) return ''
    return `
      <tr>
        <td style="padding: 0 0 8px 0;">
          <p style="margin: 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af;">${title}</p>
        </td>
      </tr>
      ${items.map(renderTenderCard).join('')}
      <tr><td style="padding: 0 0 8px 0;"></td></tr>`
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TenderWatch Daily Digest</title>
</head>
<body style="margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f3f4f6; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="padding: 0 20px 24px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #111827;">TenderWatch</h1>
                  </td>
                  <td align="right">
                    <span style="font-size: 12px; color: #9ca3af;">Daily Digest</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding: 0 20px 20px 20px;">
              <p style="margin: 0 0 4px 0; font-size: 15px; color: #111827;">Good morning ${escapeHtml(userName)},</p>
              <p style="margin: 0; font-size: 14px; color: #6b7280;">
                We found <strong style="color: #111827;">${tenders.length} new tender${tenders.length !== 1 ? 's' : ''}</strong> matching your <strong style="color: #111827;">"${escapeHtml(profileName)}"</strong> profile.
              </p>
            </td>
          </tr>

          <!-- Tender cards -->
          <tr>
            <td style="padding: 0 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${renderSection('High relevance', highRelevance)}
                ${renderSection('Moderate relevance', mediumRelevance)}
                ${renderSection('Other matches', lowRelevance)}
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding: 24px 20px;">
              <a href="${APP_URL}/feed" style="display: inline-block; background: #2563eb; color: #ffffff; font-size: 14px; font-weight: 600; padding: 10px 24px; border-radius: 8px; text-decoration: none;">View all matches</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 20px 0 20px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 11px; color: #9ca3af; line-height: 1.5; text-align: center;">
                You're receiving this because you have email alerts enabled for your monitoring profile.<br>
                <a href="${APP_URL}/settings" style="color: #6b7280; text-decoration: underline;">Manage preferences</a> · <a href="${APP_URL}/settings" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildPlainText(params: DigestParams): string {
  const { userName, profileName, tenders } = params
  const highRelevance = tenders.filter((t) => t.relevance_score >= 80)
  const mediumRelevance = tenders.filter((t) => t.relevance_score >= 40 && t.relevance_score < 80)
  const lowRelevance = tenders.filter((t) => t.relevance_score < 40)

  const renderTender = (t: DigestTender, i: number) => {
    let line = `${i + 1}. ${t.title}\n   ${t.buyer_name || 'Unknown buyer'} · ${t.buyer_country || ''} · ${formatValue(t.estimated_value_eur) || 'Value not specified'}\n   Deadline: ${formatDeadline(t.submission_deadline)}`
    if (t.ai_reason) line += `\n   → ${t.ai_reason}`
    return line + '\n'
  }

  let body = `Good morning ${userName},\n\nWe found ${tenders.length} new tender${tenders.length !== 1 ? 's' : ''} matching your "${profileName}" profile.\n\n`

  if (highRelevance.length > 0) {
    body += `HIGH RELEVANCE (score 80+)\n${'─'.repeat(40)}\n`
    body += highRelevance.map(renderTender).join('\n') + '\n'
  }
  if (mediumRelevance.length > 0) {
    body += `MODERATE RELEVANCE (score 40-79)\n${'─'.repeat(40)}\n`
    body += mediumRelevance.map(renderTender).join('\n') + '\n'
  }
  if (lowRelevance.length > 0) {
    body += `OTHER MATCHES\n${'─'.repeat(40)}\n`
    body += lowRelevance.map(renderTender).join('\n')
  }

  body += `\n\nView all matches: ${APP_URL}/feed\n\nTenderWatch · Manage preferences: ${APP_URL}/settings`
  return body
}

export async function sendDailyDigest(params: DigestParams) {
  const html = buildHtml(params)
  const text = buildPlainText(params)

  const { error } = await getResend().emails.send({
    from: 'TenderWatch <onboarding@resend.dev>',
    to: params.to,
    subject: `TenderWatch: ${params.tenders.length} new tender${params.tenders.length !== 1 ? 's' : ''} match your profile`,
    html,
    text,
  })

  if (error) {
    console.error('Failed to send digest email:', error)
    throw error
  }
}
