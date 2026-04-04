import Anthropic from '@anthropic-ai/sdk'

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

interface TenderForSummary {
  title: string
  buyer_name: string | null
  buyer_country: string | null
  cpv_codes: string[]
  estimated_value_eur: number | null
  submission_deadline: string | null
  description: string | null
}

export async function summarizeTender(
  tender: TenderForSummary
): Promise<string> {
  const valueStr = tender.estimated_value_eur
    ? `EUR ${tender.estimated_value_eur.toLocaleString()}`
    : 'Not specified'

  const message = await getClient().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `You are an expert public procurement analyst. Summarize this tender notice for a small business evaluating whether to bid.

Tender title: ${tender.title}
Buyer: ${tender.buyer_name || 'Not specified'} (${tender.buyer_country || 'Unknown'})
CPV codes: ${tender.cpv_codes.join(', ') || 'None'}
Estimated value: ${valueStr}
Deadline: ${tender.submission_deadline || 'Not specified'}
Description: ${tender.description || 'No description available'}

Provide a summary in this exact format:
- WHAT: One sentence on what is being procured (plain language, no jargon)
- WHO: Who is buying and any relevant context about the buyer
- VALUE: Estimated contract value and duration if stated
- REQUIREMENTS: Key eligibility or qualification requirements (2-3 bullet points)
- DEADLINE: Submission deadline and any important dates
- FIT FOR SME: One sentence assessment of whether this is accessible for a small company

Keep the total summary under 150 words. Use plain language.`,
      },
    ],
  })

  const content = message.content[0]
  if (content.type === 'text') {
    return content.text
  }
  throw new Error('Unexpected response format from Claude API')
}
