interface ScoringTender {
  cpv_codes: string[]
  title: string
  description: string | null
  buyer_country: string | null
  estimated_value_eur: number | null
}

interface ScoringProfile {
  cpv_codes: string[]
  keywords: string[]
  exclude_keywords: string[]
  countries: string[]
  min_value_eur: number | null
  max_value_eur: number | null
}

export interface ScoreResult {
  score: number
  matched_cpv: string[]
  matched_keywords: string[]
}

export function calculateRelevance(
  tender: ScoringTender,
  profile: ScoringProfile
): ScoreResult {
  let score = 0
  const matched_cpv: string[] = []
  const matched_keywords: string[] = []

  // Check exclude keywords first - if any match, score 0
  const fullText =
    `${tender.title} ${tender.description || ''}`.toLowerCase()
  for (const kw of profile.exclude_keywords) {
    if (fullText.includes(kw.toLowerCase())) {
      return { score: 0, matched_cpv: [], matched_keywords: [] }
    }
  }

  // CPV code matching (max 40 points)
  for (const tCpv of tender.cpv_codes) {
    for (const pCpv of profile.cpv_codes) {
      if (tCpv === pCpv) {
        score += 40
        matched_cpv.push(tCpv)
      } else if (tCpv.substring(0, 5) === pCpv.substring(0, 5)) {
        // Parent/sibling category match (first 5 digits)
        score += 20
        matched_cpv.push(tCpv)
      } else if (tCpv.substring(0, 3) === pCpv.substring(0, 3)) {
        // Division-level match (first 3 digits)
        score += 10
        matched_cpv.push(tCpv)
      }
    }
  }
  // Cap CPV score at 40
  score = Math.min(score, 40)

  // Keyword matching (max 30 points)
  const titleLower = tender.title.toLowerCase()
  const descLower = (tender.description || '').toLowerCase()
  for (const kw of profile.keywords) {
    const kwLower = kw.toLowerCase()
    if (titleLower.includes(kwLower)) {
      score += 20
      matched_keywords.push(kw)
    } else if (descLower.includes(kwLower)) {
      score += 10
      matched_keywords.push(kw)
    }
  }
  // Cap keyword score contribution
  score = Math.min(score, 70)

  // Geography match (15 points)
  // TED uses 3-letter codes (DNK), profiles use 2-letter (DK)
  if (tender.buyer_country && profile.countries.length > 0) {
    const iso3to2: Record<string, string> = {
      'DNK': 'DK', 'NOR': 'NO', 'SWE': 'SE', 'DEU': 'DE',
      'NLD': 'NL', 'FIN': 'FI', 'FRA': 'FR', 'GBR': 'UK',
      'ESP': 'ES', 'ITA': 'IT', 'POL': 'PL', 'BEL': 'BE',
      'AUT': 'AT', 'PRT': 'PT', 'IRL': 'IE', 'CZE': 'CZ',
      'ROU': 'RO', 'BGR': 'BG', 'HRV': 'HR', 'LTU': 'LT',
      'LVA': 'LV', 'EST': 'EE',
    }
    const country2 = iso3to2[tender.buyer_country] || tender.buyer_country
    if (profile.countries.includes(country2) || profile.countries.includes(tender.buyer_country)) {
      score += 15
    }
  }

  // Value range match (15 points)
  if (tender.estimated_value_eur !== null) {
    const inRange =
      (profile.min_value_eur === null ||
        tender.estimated_value_eur >= profile.min_value_eur) &&
      (profile.max_value_eur === null ||
        tender.estimated_value_eur <= profile.max_value_eur)
    if (inRange) {
      score += 15
    }
  }

  return {
    score: Math.min(score, 100),
    matched_cpv: [...new Set(matched_cpv)],
    matched_keywords: [...new Set(matched_keywords)],
  }
}
