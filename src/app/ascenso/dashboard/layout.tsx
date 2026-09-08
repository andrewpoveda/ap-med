import Link from 'next/link'
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <><nav aria-label="Program selection" className="max-w-5xl mx-auto px-5 pt-4"><Link className="underline text-sm" href="/ascenso/programs">Choose program or role</Link></nav>{children}</>
}
