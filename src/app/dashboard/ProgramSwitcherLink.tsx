import Link from 'next/link'

export default function ProgramSwitcherLink() {
  return (
    <nav aria-label="Program selection" className="mb-4 flex justify-end">
      <Link
        className="inline-flex min-h-10 items-center rounded-md border border-[#d8cbb4] bg-white px-3 py-2 text-sm font-medium text-[#6f5428] transition-colors hover:bg-[#f7f3ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a96e] focus-visible:ring-offset-2"
        href="/ascenso/programs"
        prefetch={false}
      >
        Switch program or role
      </Link>
    </nav>
  )
}
