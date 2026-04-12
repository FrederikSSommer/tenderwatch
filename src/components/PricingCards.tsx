import { Check } from 'lucide-react'
import { clsx } from 'clsx'

const plans = [
  {
    name: 'Free',
    price: '0',
    description: 'Browse recent tenders',
    features: [
      'Search tenders (last 7 days)',
      'Basic CPV code filtering',
      'Account required',
    ],
    cta: 'Start free',
    href: '/signup',
    highlighted: false,
  },
  {
    name: 'Starter',
    price: '299',
    description: 'For solo consultants',
    features: [
      '1 monitoring profile',
      'Daily email digest',
      '30 AI summaries/month',
      'Dashboard with tender feed',
      'Follow tenders',
    ],
    cta: 'Start 14-day trial',
    href: '/signup?plan=starter',
    highlighted: true,
  },
  {
    name: 'Professional',
    price: '499',
    description: 'For growing businesses',
    features: [
      'Up to 5 monitoring profiles',
      'Unlimited AI summaries',
      'Push notifications',
      'Deadline calendar',
      'Export to CSV',
      'Priority support',
    ],
    cta: 'Start 14-day trial',
    href: '/signup?plan=professional',
    highlighted: false,
  },
]

export function PricingCards() {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-3 max-w-5xl mx-auto">
      {plans.map((plan) => (
        <div
          key={plan.name}
          className={clsx(
            'rounded-2xl border p-8 flex flex-col',
            plan.highlighted
              ? 'border-blue-600 ring-2 ring-blue-600 shadow-lg'
              : 'border-gray-200'
          )}
        >
          {plan.highlighted && (
            <span className="inline-block self-start mb-4 text-xs font-semibold text-blue-600 bg-blue-50 rounded-full px-3 py-1">
              Most popular
            </span>
          )}
          <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
          <p className="mt-1 text-sm text-gray-500">{plan.description}</p>
          <div className="mt-4">
            <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
            <span className="text-gray-500 ml-1">DKK/mo</span>
          </div>
          <ul className="mt-6 space-y-3 flex-1">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm text-gray-600">
                <Check className="h-5 w-5 text-blue-600 flex-shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
          <a
            href={plan.href}
            className={clsx(
              'mt-8 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors',
              plan.highlighted
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
            )}
          >
            {plan.cta}
          </a>
        </div>
      ))}
    </div>
  )
}
