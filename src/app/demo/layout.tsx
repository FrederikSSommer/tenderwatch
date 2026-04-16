import { DashboardShell } from '@/components/DashboardShell'

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell userEmail="demo@tenderwatch.dk" plan="professional" isDemo>
      <div className="bg-blue-600 text-white text-center text-xs py-1.5 font-medium">
        Demo mode — showing sample data for a maritime engineering consultancy
      </div>
      {children}
    </DashboardShell>
  )
}
