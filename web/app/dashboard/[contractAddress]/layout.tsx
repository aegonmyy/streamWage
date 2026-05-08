import { DashboardShell } from "@/components/dashboard/dashboard-shell"

export default function PayrollDashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>
}
