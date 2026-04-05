import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

interface DigestTender {
  id: string
  title: string
  buyer_name: string | null
  buyer_country: string | null
  estimated_value_eur: number | null
  submission_deadline: string | null
  relevance_score: number
  cpv_codes: string[]
}

interface DigestParams {
  to: string
  userName: string
  profileName: string
  tenders: DigestTender[]
}

export async function sendDailyDigest({
  to,
  userName,
  profileName,
  tenders,
}: DigestParams) {
  const highRelevance = tenders.filter((t) => t.relevance_score >= 80)
  const mediumRelevance = tenders.filter(
    (t) => t.relevance_score >= 40 && t.relevance_score < 80
  )
  const lowRelevance = tenders.filter((t) => t.relevance_score < 40)

  const formatValue = (v: number | null) =>
    v ? `EUR ${v.toLocaleString()}` : 'Not specified'

  const renderTender = (t: DigestTender, i: number) =>
    `${i + 1}. ${t.title}\n   ${t.buyer_name || 'Unknown buyer'} · ${t.buyer_country || ''} · ${formatValue(t.estimated_value_eur)}\n   Deadline: ${t.submission_deadline ? new Date(t.submission_deadline).toLocaleDateString() : 'Not specified'}\n`

  let body = `Good morning ${userName},\n\nWe found ${tenders.length} new tender${tenders.length !== 1 ? 's' : ''} matching your "${profileName}" profile.\n\n`

  if (highRelevance.length > 0) {
    body += `HIGH RELEVANCE (score 80+)\n${'─'.repeat(40)}\n`
    body += highRelevance.map(renderTender).join('\n')
    body += '\n'
  }

  if (mediumRelevance.length > 0) {
    body += `MODERATE RELEVANCE (score 40-79)\n${'─'.repeat(40)}\n`
    body += mediumRelevance.map(renderTender).join('\n')
    body += '\n'
  }

  if (lowRelevance.length > 0) {
    body += `OTHER MATCHES\n${'─'.repeat(40)}\n`
    body += lowRelevance.map(renderTender).join('\n')
  }

  body += `\n\nView all matches on your dashboard: ${process.env.NEXT_PUBLIC_APP_URL}/feed\n\nTenderWatch · Unsubscribe: ${process.env.NEXT_PUBLIC_APP_URL}/settings`

  const { error } = await getResend().emails.send({
    from: 'TenderWatch <alerts@tenderwatch.dk>',
    to,
    subject: `TenderWatch: ${tenders.length} new tender${tenders.length !== 1 ? 's' : ''} match your profile`,
    text: body,
  })

  if (error) {
    console.error('Failed to send digest email:', error)
    throw error
  }
}
