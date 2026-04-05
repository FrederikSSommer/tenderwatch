import { DashboardSidebar } from '@/components/DashboardSidebar'

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50">
      <DashboardSidebar userEmail="demo@tenderwatch.dk" plan="professional" isDemo />
      <main className="flex-1 overflow-auto">
        <div className="bg-blue-600 text-white text-center text-xs py-1.5 font-medium">
          Demo mode — showing sample data for a maritime engineering consultancy
        </div>
        {children}
      </main>
    </div>
  )
}
