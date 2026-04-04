import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!)
}

function getServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = getServiceClient()

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string

      const priceId = subscription.items.data[0]?.price?.id
      let plan: 'starter' | 'professional' = 'starter'
      if (priceId === process.env.STRIPE_PROFESSIONAL_PRICE_ID) {
        plan = 'professional'
      }

      const status = subscription.status === 'active' ? 'active'
        : subscription.status === 'trialing' ? 'trialing'
        : subscription.status === 'past_due' ? 'past_due'
        : 'cancelled'

      await supabase
        .from('subscriptions')
        .update({
          stripe_subscription_id: subscription.id,
          plan,
          status: status as 'active' | 'cancelled' | 'past_due' | 'trialing',
          current_period_end: new Date((subscription as any).current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_customer_id', customerId)

      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string

      await supabase
        .from('subscriptions')
        .update({
          plan: 'free',
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_customer_id', customerId)

      break
    }
  }

  return NextResponse.json({ received: true })
}
