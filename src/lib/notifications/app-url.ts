// Base URL for links in emails. On Vercel production, prefer the project's
// production domain: NEXT_PUBLIC_APP_URL may point at a per-deployment
// *.vercel.app URL, which sits behind Vercel Deployment Protection (login wall).
export const APP_URL = (
  (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.NEXT_PUBLIC_APP_URL) || 'https://tenderwatch.dk'
).replace(/\/+$/, '')
