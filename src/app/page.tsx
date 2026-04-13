import { ArrowRight, Zap, Bell, Sparkles, Search, BarChart3, Mail, Shield, ThumbsUp, ThumbsDown } from 'lucide-react'

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
              href="/try"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Try it free
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700 mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            AI-powered tender monitoring
          </div>
          <h1 className="text-5xl font-bold text-gray-900 tracking-tight leading-tight">
            Tired of missing important
            <br />
            <span className="text-blue-600">public tender opportunities?</span>
          </h1>
          <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto">
            Tell our AI what your company does. It builds your monitoring profile, scans thousands of EU tenders daily, learns from your feedback, and delivers only the opportunities that matter.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/try"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700 shadow-sm"
            >
              <Sparkles className="h-4 w-4" />
              Build your profile — 3 min, no signup
            </a>
            <a
              href="/demo/feed"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50"
            >
              See demo feed
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <p className="mt-4 text-xs text-gray-400">Free to start. No credit card required.</p>
        </div>
      </section>

      {/* Visual preview */}
      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 md:p-8">
            <div className="text-center mb-6">
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Your daily feed</p>
            </div>
            <div className="space-y-3 max-w-3xl mx-auto">
              {[
                { score: 92, title: 'Naval architecture services for new ferry design', buyer: 'Danish Defence Acquisition', country: 'DK', reason: 'Core service match — ship design and naval architecture consultancy', color: 'green' },
                { score: 78, title: 'Framework agreement for marine engineering consultancy', buyer: 'Søfartsstyrelsen', country: 'DK', reason: 'Framework for ongoing maritime engineering advisory services', color: 'green' },
                { score: 64, title: 'EPC contract for offshore wind service vessel', buyer: 'Ørsted A/S', country: 'DK', reason: 'Vessel construction project matching shipbuilding capability', color: 'yellow' },
              ].map((t, i) => (
                <div key={i} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          t.color === 'green' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>{t.score}</span>
                        <h4 className="text-sm font-medium text-gray-900">{t.title}</h4>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{t.buyer} · {t.country}</p>
                      <p className="text-xs text-blue-600 mt-1 italic flex items-center gap-1">
                        <Sparkles className="h-3 w-3 flex-shrink-0" />
                        {t.reason}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-gray-400 mt-4">Real tenders from TED, ranked by AI relevance to your profile</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">How it works</h2>
          <p className="text-center text-gray-500 mb-12">From zero to relevant tenders in under 3 minutes</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                <Search className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">1. Describe</h3>
              <p className="mt-2 text-gray-600 text-sm">
                Tell our AI what your company does in plain language. It generates CPV codes, keywords, and a monitoring profile automatically.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">2. Monitor</h3>
              <p className="mt-2 text-gray-600 text-sm">
                Every morning we scan thousands of EU tenders. A two-stage AI pipeline filters out noise and ranks what&apos;s actually relevant.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                <Mail className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">3. Deliver</h3>
              <p className="mt-2 text-gray-600 text-sm">
                Get a daily or weekly email digest with matched tenders, relevance scores, and AI explanations of why each one matters.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                <BarChart3 className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">4. Learn</h3>
              <p className="mt-2 text-gray-600 text-sm">
                Follow tenders you like, dismiss the ones you don&apos;t. The AI learns your preferences and gets smarter with every interaction.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">An AI engine that understands your business</h2>
          <p className="text-center text-gray-500 mb-12">Not just keyword matching — real understanding of what you actually bid on</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { icon: Sparkles, title: 'AI-powered from start to finish', desc: 'From building your profile to scoring tenders to explaining why each one matters — AI is the engine, not just a feature.' },
              { icon: BarChart3, title: 'Gets smarter over time', desc: 'Every follow and dismiss teaches the AI what you care about. Your feed improves with every interaction — like a colleague who learns your taste.' },
              { icon: Bell, title: 'Smart email digests', desc: 'Daily or weekly emails with your top matches, scored and explained. Choose your frequency or check the feed when you want.' },
              { icon: Shield, title: 'EU-wide coverage', desc: 'We monitor TED (Tenders Electronic Daily) across all EU member states. Set your target countries and contract sizes.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-lg border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">{title}</h3>
                </div>
                <p className="text-sm text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900">
            Find your first relevant tender in 3 minutes
          </h2>
          <p className="mt-4 text-gray-600">
            No signup required. Tell our AI what you do, swipe through real tenders, and see what your daily feed would look like.
          </p>
          <a
            href="/try"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-8 py-3.5 text-base font-semibold text-white hover:bg-blue-700 shadow-sm"
          >
            <Sparkles className="h-4 w-4" />
            Build your profile free
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
            <a href="/try" className="hover:text-gray-900">Try free</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
