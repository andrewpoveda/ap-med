import Link from 'next/link'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl text-base leading-relaxed [&_h1]:mb-4 [&_h1]:text-4xl [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_p]:mb-4 [&_a]:underline [&_a]:underline-offset-4">
      {children}
      <nav aria-label="Legal pages" className="mt-10 flex flex-wrap gap-6 border-t border-stone-200 pt-6">
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/terms">Terms of Service</Link>
        <a href="mailto:apmedpodcast@gmail.com">Contact AP MED</a>
      </nav>
    </article>
  )
}
