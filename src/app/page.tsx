import { PricingCards } from '@/components/PricingCards'
import { ArrowRight, Zap, Bell, Sparkles } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-bold text-gray-900">TenderWatch</span>
          <div className="flex items-center gap-4">
            <a href="/login" className="text-sm text-gray-600 hover:text-gray-900">Sign in</a>
            <a
              href="/signup"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Start free
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-gray-900 tracking-tight leading-tight">
            Stop checking TED manually.
            <br />
            <span className="text-blue-600">We find the tenders. You win the contracts.</span>
          </h1>
          <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto">
            Smart monitoring of EU and Danish public tenders for small and medium businesses.
            AI-powered summaries. Daily alerts. From 299 DKK/month.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <a
              href="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700"
            >
              Start free — find tenders now
              <ArrowRight className="h-5 w-5" />
            </a>
            <a
              href="/try"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Sparkles className="h-4 w-4" />
              Build your profile
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">1. Tell us what you do</h3>
              <p className="mt-2 text-gray-600 text-sm">
                Describe your business in plain language. Our AI suggests the right CPV codes and keywords.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">2. We monitor 24/7</h3>
              <p className="mt-2 text-gray-600 text-sm">
                Every day we scan TED and MitUdbud for new tenders matching your profile.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                <Bell className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">3. You get the good ones</h3>
              <p className="mt-2 text-gray-600 text-sm">
                AI-summarized tenders in your inbox every morning. Ranked by relevance. Ready to evaluate.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">Simple pricing</h2>
          <p className="text-center text-gray-600 mb-12">No setup fees. No long-term contracts. Cancel anytime.</p>
          <PricingCards />
        </div>
      </section>

      {/* Comparison */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Why TenderWatch?</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-500"></th>
                  <th className="text-center py-3 px-4 font-semibold text-blue-600">TenderWatch</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500">Mercell</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-500">Tendium</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  ['Price/month', '299-499 DKK', '2.000+ DKK', 'Contact sales'],
                  ['Setup time', '3 minutes', 'Sales call', 'Sales call'],
                  ['AI summaries', 'Yes', 'Yes', 'Yes'],
                  ['Danish + EU tenders', 'Yes', 'Yes', 'Yes'],
                  ['Built for SMVs', 'Yes', 'No (enterprise)', 'No (enterprise)'],
                  ['Free trial', 'Yes', '14 days', 'Yes'],
                ].map(([label, tw, mercell, tendium]) => (
                  <tr key={label}>
                    <td className="py-3 px-4 font-medium text-gray-900">{label}</td>
                    <td className="py-3 px-4 text-center font-semibold text-blue-600">{tw}</td>
                    <td className="py-3 px-4 text-center text-gray-600">{mercell}</td>
                    <td className="py-3 px-4 text-center text-gray-600">{tendium}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Testimonial / CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <blockquote className="text-xl text-gray-700 italic">
            &ldquo;We found a EUR 800.000 framework tender we would have missed completely. Paid for itself in the first week.&rdquo;
          </blockquote>
          <p className="mt-4 text-sm text-gray-500">— Engineering consultancy, Copenhagen</p>
          <a
            href="/signup"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700"
          >
            Start finding tenders — free
            <ArrowRight className="h-5 w-5" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-gray-500">
          <span>TenderWatch</span>
          <div className="flex gap-6">
            <a href="/login" className="hover:text-gray-900">Sign in</a>
            <a href="/signup" className="hover:text-gray-900">Sign up</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
