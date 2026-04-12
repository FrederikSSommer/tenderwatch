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

export interface LearnedSignals {
  // CPV codes (full 8-digit) seen on tenders the user has subscribed to
  cpv_codes: string[]
  // Distinctive title tokens from subscribed tenders
  keywords: string[]
}

export interface ScoreResult {
  score: number
  matched_cpv: string[]
  matched_keywords: string[]
  // Bonus points awarded from learned signals (subset of overall score)
  learned_bonus?: number
}

export function calculateRelevance(
  tender: ScoringTender,
  profile: ScoringProfile,
  learned?: LearnedSignals
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
  // Normalise both sides: strip trailing zeros and checksum for robust prefix matching
  const normCpv = (c: string) => c.replace(/-\d+$/, '').padEnd(8, '0')
  const tCpvNorm = tender.cpv_codes.map(normCpv)
  const pCpvNorm = profile.cpv_codes.map(normCpv)

  for (const tCpv of tCpvNorm) {
    for (const pCpv of pCpvNorm) {
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
      } else if (tCpv.substring(0, 2) === pCpv.substring(0, 2)) {
        // Division-level match (first 2 digits — broadest category)
        score += 5
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

  // Geography match (15 points) — but ONLY if there's already a topic signal
  // (CPV or keyword match). Country alone should never push a tender across
  // the relevance threshold — that's how workwear ends up in a shipbuilder's feed.
  const hasTopicSignal = matched_cpv.length > 0 || matched_keywords.length > 0
  if (hasTopicSignal && tender.buyer_country && profile.countries.length > 0) {
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

  // Value range match (15 points) — also gated on topic signal
  if (hasTopicSignal && tender.estimated_value_eur !== null) {
    const inRange =
      (profile.min_value_eur === null ||
        tender.estimated_value_eur >= profile.min_value_eur) &&
      (profile.max_value_eur === null ||
        tender.estimated_value_eur <= profile.max_value_eur)
    if (inRange) {
      score += 15
    }
  }

  // Learned-signal bonus (max 25 points) — biases scoring toward patterns
  // seen on tenders the user has actually subscribed to.
  let learned_bonus = 0
  if (learned && (learned.cpv_codes.length > 0 || learned.keywords.length > 0)) {
    const learnedCpvSet = new Set(learned.cpv_codes)
    const learnedDivSet = new Set(learned.cpv_codes.map(c => c.substring(0, 3)))
    for (const tCpv of tender.cpv_codes) {
      if (learnedCpvSet.has(tCpv)) {
        learned_bonus += 12
      } else if (learnedDivSet.has(tCpv.substring(0, 3))) {
        learned_bonus += 5
      }
    }
    for (const kw of learned.keywords) {
      const kwLower = kw.toLowerCase()
      if (titleLower.includes(kwLower)) {
        learned_bonus += 6
        if (!matched_keywords.includes(kw)) matched_keywords.push(kw)
      } else if (descLower.includes(kwLower)) {
        learned_bonus += 2
      }
    }
    learned_bonus = Math.min(learned_bonus, 25)
    score += learned_bonus
  }

  return {
    score: Math.min(score, 100),
    matched_cpv: [...new Set(matched_cpv)],
    matched_keywords: [...new Set(matched_keywords)],
    learned_bonus,
  }
}

// Extracts distinctive keywords from a list of subscribed tender titles.
// Returns single-word tokens that occur in at least 2 titles, sorted by frequency.
export function extractLearnedKeywords(titles: string[]): string[] {
  const STOP = new Set([
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'tender', 'contract',
    'services', 'service', 'supply', 'works', 'public', 'procurement', 'notice',
    'framework', 'agreement', 'project', 'system', 'systems', 'and/or', 'related',
    'og', 'af', 'til', 'med', 'for', 'der', 'die', 'das', 'und', 'des', 'du',
  ])
  const counts = new Map<string, number>()
  for (const title of titles) {
    if (!title) continue
    const seen = new Set<string>()
    const tokens = title
      .toLowerCase()
      .split(/[^a-zæøåäöüéèêàçñ0-9]+/i)
      .filter(t => t.length >= 4 && !STOP.has(t) && !/^\d+$/.test(t))
    for (const t of tokens) {
      if (seen.has(t)) continue
      seen.add(t)
      counts.set(t, (counts.get(t) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([t]) => t)
}
