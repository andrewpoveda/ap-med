'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ScoredMentor } from '@/types/mentor'

export default function MatchResultsPage() {
  const router = useRouter()
  const [mentors, setMentors] = useState<ScoredMentor[]>([])
  const [menteeName, setMenteeName] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('matchResults')
    const name = sessionStorage.getItem('menteeName') || ''
    if (!raw) {
      router.replace('/mentors')
      return
    }
    setMentors(JSON.parse(raw))
    setMenteeName(name)
    setLoaded(true)
  }, [router])

  if (!loaded) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#94a3b8' }}>Loading your matches...</p>
      </div>
    )
  }

  const top3 = mentors.slice(0, 3)
  const rest = mentors.slice(3)
  const firstName = menteeName.split(' ')[0] || 'there'

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', color: 'white', fontFamily: 'inherit' }}>
      {/* Nav */}
      <nav style={{
        display: 'flex', justifyContent: 'center', gap: '2rem',
        padding: '1.25rem 2rem', borderBottom: '1px solid #1e2330', fontSize: '0.9rem',
      }}>
        {[
          { label: 'home', href: '/' },
          { label: 'about', href: '/about' },
          { label: 'AP MED', href: '/projects' },
          { label: 'blog', href: '/blog' },
          { label: 'mentors', href: '/mentors' },
        ].map(({ label, href }) => (
          <Link key={label} href={href} style={{ color: label === 'mentors' ? '#60a5fa' : '#94a3b8', textDecoration: 'none' }}>
            {label}
          </Link>
        ))}
        <Link href="/mentor-onboarding" style={{ color: '#94a3b8', textDecoration: 'none' }}>
          become a mentor
        </Link>
      </nav>

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
        {/* Header */}
        <p style={{ color: '#60a5fa', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          AP MED MENTORS
        </p>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          Your top matches, {firstName}
        </h1>
        <p style={{ color: '#94a3b8', marginBottom: '3rem', lineHeight: 1.6 }}>
          Based on your specialty interests, background, and what you need help with.
        </p>

        {/* Top 3 */}
        {top3.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Best matches</span>
              <span style={{ background: '#1a2744', color: '#60a5fa', borderRadius: '9999px', padding: '0.2rem 0.6rem', fontSize: '0.75rem', fontWeight: 600 }}>
                Top {top3.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '3rem' }}>
              {top3.map((mentor, i) => (
                <MatchCard key={mentor.id} mentor={mentor} rank={i + 1} featured />
              ))}
            </div>
          </>
        )}

        {/* Browse All */}
        {rest.length > 0 && (
          <>
            <hr style={{ border: 'none', borderTop: '1px solid #1e2330', marginBottom: '2rem' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Browse all mentors</span>
              <span style={{ background: '#1a1f2e', color: '#94a3b8', borderRadius: '9999px', padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
                {rest.length} more
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {rest.map(mentor => (
                <MatchCard key={mentor.id} mentor={mentor} featured={false} />
              ))}
            </div>
          </>
        )}

        {mentors.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: '#94a3b8' }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>No mentors found yet.</p>
            <Link href="/mentors" style={{ color: '#60a5fa' }}>Browse the directory →</Link>
          </div>
        )}
      </div>
    </div>
  )
}

function MatchCard({ mentor, rank, featured }: { mentor: ScoredMentor; rank?: number; featured: boolean }) {
  const matchColor =
    mentor.matchPercent >= 75 ? '#4ade80' :
    mentor.matchPercent >= 50 ? '#60a5fa' :
    '#94a3b8'

  return (
    <div style={{
      background: featured ? '#111827' : '#0f1117',
      border: `1px solid ${featured ? '#1e3a5f' : '#1e2330'}`,
      borderRadius: '12px',
      padding: featured ? '1.5rem' : '1.25rem',
      display: 'flex',
      gap: '1.25rem',
      alignItems: 'flex-start',
      transition: 'border-color 0.15s',
    }}>
      {/* Rank badge */}
      {rank && (
        <div style={{
          flexShrink: 0,
          width: '2rem', height: '2rem',
          borderRadius: '50%',
          background: rank === 1 ? '#1a2744' : '#1a1f2e',
          border: `1px solid ${rank === 1 ? '#3b82f6' : '#2a3040'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.8rem', fontWeight: 700, color: rank === 1 ? '#60a5fa' : '#94a3b8',
        }}>
          #{rank}
        </div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
          <span style={{ fontWeight: 700, fontSize: featured ? '1.1rem' : '1rem' }}>
            {mentor.first_name} {mentor.last_name}
            {mentor.credentials ? `, ${mentor.credentials}` : ''}
          </span>
        </div>

        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          {mentor.current_role}{mentor.institution ? ` · ${mentor.institution}` : ''}
        </p>

        {featured && mentor.bio && (
          <p style={{ color: '#cbd5e1', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '0.75rem' }}>
            {mentor.bio.length > 180 ? mentor.bio.slice(0, 180) + '…' : mentor.bio}
          </p>
        )}

        {/* Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {(mentor.specialty || []).slice(0, 3).map(s => (
            <span key={s} style={tagStyle('#1e2d45', '#3b82f6')}>{s}</span>
          ))}
          {(mentor.identity || []).slice(0, 2).map(id => (
            <span key={id} style={tagStyle('#1e2d30', '#34d399')}>{id}</span>
          ))}
        </div>
      </div>

      {/* Match % + CTA */}
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <div style={{ fontSize: featured ? '1.5rem' : '1.25rem', fontWeight: 800, color: matchColor, marginBottom: '0.25rem' }}>
          {mentor.matchPercent}%
        </div>
        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '1rem' }}>match</div>

        <a
          href={`/mentee-onboarding?mentor=${encodeURIComponent(`${mentor.first_name} ${mentor.last_name}`)}`}
          style={{
            display: 'inline-block',
            background: featured ? '#60a5fa' : '#1a2744',
            color: featured ? '#0f1117' : '#60a5fa',
            border: featured ? 'none' : '1px solid #3b82f6',
            borderRadius: '6px',
            padding: '0.4rem 0.85rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Request →
        </a>
      </div>
    </div>
  )
}

function tagStyle(bg: string, color: string): React.CSSProperties {
  return {
    background: bg,
    color,
    borderRadius: '9999px',
    padding: '0.2rem 0.6rem',
    fontSize: '0.7rem',
    fontWeight: 500,
  }
}
