import { NextRequest, NextResponse } from 'next/server'
import { inferDraftProfile } from '@/lib/ai/infer-profile'

export async function POST(request: NextRequest) {
  const {
    description,
    companyCountry,
    sectors,
    subsectors,
    selectedCountries,
    valueRange,
    likedTenders,
    dislikedTenders,
  } = await request.json()

  try {
    const profile = await inferDraftProfile({
      description,
      companyCountry,
      sectors,
      subsectors,
      countries: selectedCountries,
      valueRange,
      likedTenders,
      dislikedTenders,
    })

    return NextResponse.json({ profile })
  } catch (error) {
    console.error('Profile generation error:', error)
    return NextResponse.json({ error: 'Failed to generate profile' }, { status: 500 })
  }
}
