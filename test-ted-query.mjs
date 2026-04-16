// Quick smoke-test for buildTEDQuery — no build, no server, no DB needed.
// Run with:  node test-ted-query.mjs

function buildTEDQuery(dateStr, cpvCodes, keywords) {
  const parts = []
  if (cpvCodes.length > 0) {
    parts.push(`cpv=[${cpvCodes.join(' OR ')}]`)
  }
  if (keywords.length > 0) {
    const kwPart = keywords.map(kw => `"${kw.replace(/"/g, '')}"`).join(' OR ')
    parts.push(cpvCodes.length > 0 ? `(${kwPart})` : kwPart)
  }
  const datePart = `PD>=${dateStr}`
  if (parts.length === 0) return datePart
  return `(${parts.join(' OR ')}) AND ${datePart}`
}

const DATE = '20260415'

const cases = [
  {
    label: 'CPV + keywords (main case from PR)',
    cpv: ['35120000', '34520000'],
    kw: ['patrol vessel', 'naval surveillance'],
    expect: '(cpv=[35120000 OR 34520000] OR ("patrol vessel" OR "naval surveillance")) AND PD>=20260415',
  },
  {
    label: 'Keywords only',
    cpv: [],
    kw: ['security camera', 'CCTV'],
    expect: '("security camera" OR "CCTV") AND PD>=20260415',
  },
  {
    label: 'CPV only',
    cpv: ['35120000'],
    kw: [],
    expect: '(cpv=[35120000]) AND PD>=20260415',
  },
  {
    label: 'No filters — date-only fallback',
    cpv: [],
    kw: [],
    expect: 'PD>=20260415',
  },
]

let passed = 0
for (const { label, cpv, kw, expect } of cases) {
  const got = buildTEDQuery(DATE, cpv, kw)
  const ok = got === expect
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) {
    console.log(`  expected: ${expect}`)
    console.log(`  got:      ${got}`)
  }
  if (ok) passed++
}

console.log(`\n${passed}/${cases.length} passed`)
if (passed < cases.length) process.exit(1)
