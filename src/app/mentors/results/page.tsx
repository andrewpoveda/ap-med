'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ScoredMentor } from '@/types/mentor'

type MenteeData = {
  full_name: string
  email: string
  school: string
  current_stage: string
  interests: string[]
  help_with: string[]
  preferred_identity: string[]
  notes?: string
  linkedin_url?: string
}

export default function MatchResultsPage() {
  const router = useRouter()
  const [mentors, setMentors] = useState<ScoredMentor[]>([])
  const [menteeName, setMenteeName] = useState('')
  const [menteeData, setMenteeData] = useState<MenteeData | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('matchResults')
      const name = sessionStorage.getItem('menteeName') || ''
      const rawMentee = sessionStorage.getItem('menteeData')
      if (!raw) {
        router.replace('/mentee-onboarding')
        return
      }
      setMentors(JSON.parse(raw))
      setMenteeName(name)
      if (rawMentee) setMenteeData(JSON.parse(rawMentee))
      setLoaded(true)
    } catch {
      router.replace('/mentee-onboarding')
    }
  }, [router])

  const handleRequest = async (mentor: ScoredMentor) => {
    setRequestedIds(prev => new Set([...prev, mentor.id]))
    if (!menteeData) return
    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentor, mentee: menteeData }),
      })
    } catch {
      // silent — UI already updated
    }
  }

  const firstName = menteeName.split(' ')[0] || 'there'
  const top3 = mentors.slice(0, 3)
  const rest = mentors.slice(3)

  if (!loaded) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1117', color: 'white', fontFamily: 'inherit' }}>
        <NavBar />
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
          <div style={{ height: '0.75rem', width: '8rem', background: '#1a1f2e', borderRadius: 4, marginBottom: '0.75rem' }} className="animate-pulse" />
          <div style={{ height: '2rem', width: '55%', background: '#1a1f2e', borderRadius: 4, marginBottom: '0.75rem' }} className="animate-pulse" />
          <div style={{ height: '0.875rem', width: '70%', background: '#1a1f2e', borderRadius: 4, marginBottom: '3rem' }} className="animate-pulse" />
          {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', color: 'white', fontFamily: 'inherit' }}>
      <NavBar />
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
        <p style={{ color: '#60a5fa', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          AP MED MENTORS
        </p>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          Your top matches, {firstName}
        </h1>
        <p style={{ color: '#94a3b8', marginBottom: '3rem', lineHeight: 1.6 }}>
          Based on your specialty interests, background, and what you need help with.
        </p>

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
                <MatchCard
                  key={mentor.id}
                  mentor={mentor}
                  rank={i + 1}
                  featured
                  requested={requestedIds.has(mentor.id)}
                  onRequest={() => handleRequest(mentor)}
                />
              ))}
            </div>
          </>
        )}

        {rest.length > 0 && (
          <>
            <hr style={{ border: 'none', borderTop: '1px solid #1e2330', marginBottom: '2rem' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showAll ? '1.5rem' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Browse all mentors</span>
                <span style={{ background: '#1a1f2e', color: '#94a3b8', borderRadius: '9999px', padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
                  {rest.length} more
                </span>
              </div>
              <button
                onClick={() => setShowAll(v => !v)}
                style={{
                  background: '#1a1f2e', border: '1px solid #2a3040', borderRadius: '6px',
                  color: '#60a5fa', padding: '0.4rem 0.85rem', fontSize: '0.8rem',
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                {showAll ? 'Collapse ↑' : 'Show all →'}
              </button>
            </div>

            {showAll && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' }}>
                {rest.map(mentor => (
                  <MatchCard
                    key={mentor.id}
                    mentor={mentor}
                    featured={false}
                    requested={requestedIds.has(mentor.id)}
                    onRequest={() => handleRequest(mentor)}
                  />
                ))}
              </div>
            )}
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

function NavBar() {
  return (
    <nav style={{
      display: 'flex', justifyContent: 'center', gap: '2rem',
      padding: '1.25rem 2rem', borderBottom: '1px solid #1e2330', fontSize: '0.9rem',
    }}>
      {[
        { label: 'home', href: '/' },
        { label: 'about', href: '/about' },
        { label: 'AP MED', href: '/projects' },
        { label: 'blog', href: '/blog' },
        { label: 'mentors', href: '/mentee-onboarding' },
      ].map(({ label, href }) => (
        <Link key={label} href={href} style={{ color: label === 'mentors' ? '#60a5fa' : '#94a3b8', textDecoration: 'none' }}>
          {label}
        </Link>
      ))}
      <Link href="/mentor-onboarding" style={{ color: '#94a3b8', textDecoration: 'none' }}>
        become a mentor
      </Link>
    </nav>
  )
}

function Avatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  const initials = name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  if (photoUrl) {
    return (
      <img src={photoUrl} alt={name} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    )
  }
  return (
    <div style={{
      width: 48, height: 48, borderRadius: '50%', background: '#1a2744', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '1rem', fontWeight: 700, color: '#60a5fa',
    }}>
      {initials}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div style={{ background: '#111827', border: '1px solid #1e3a5f', borderRadius: '12px', padding: '1.5rem', display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#1e2330', flexShrink: 0 }} className="animate-pulse" />
      <div style={{ flex: 1 }}>
        <div style={{ height: '1rem', width: '40%', background: '#1e2330', borderRadius: 4, marginBottom: '0.5rem' }} className="animate-pulse" />
        <div style={{ height: '0.75rem', width: '60%', background: '#1a1f2e', borderRadius: 4, marginBottom: '0.5rem' }} className="animate-pulse" />
        <div style={{ height: '0.75rem', width: '90%', background: '#1a1f2e', borderRadius: 4, marginBottom: '0.4rem' }} className="animate-pulse" />
        <div style={{ height: '0.75rem', width: '80%', background: '#1a1f2e', borderRadius: 4 }} className="animate-pulse" />
      </div>
    </div>
  )
}

function MatchCard({
  mentor, rank, featured, requested, onRequest,
}: {
  mentor: ScoredMentor
  rank?: number
  featured: boolean
  requested: boolean
  onRequest: () => void
}) {
  const matchColor =
    mentor.matchPercent >= 75 ? '#4ade80' :
    mentor.matchPercent >= 50 ? '#60a5fa' :
    '#94a3b8'

  const fullName = `${mentor.first_name} ${mentor.last_name}`

  return (
    <div style={{
      background: featured ? '#111827' : '#0f1117',
      border: `1px solid ${featured ? '#1e3a5f' : '#1e2330'}`,
      borderRadius: '12px',
      padding: featured ? '1.5rem' : '1.25rem',
      display: 'flex',
      gap: '1.25rem',
      alignItems: 'flex-start',
    }}>
      <Avatar name={fullName} photoUrl={mentor.photo_url} />

      {rank && (
        <div style={{
          flexShrink: 0, width: '2rem', height: '2rem', borderRadius: '50%',
          background: rank === 1 ? '#1a2744' : '#1a1f2e',
          border: `1px solid ${rank === 1 ? '#3b82f6' : '#2a3040'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.8rem', fontWeight: 700, color: rank === 1 ? '#60a5fa' : '#94a3b8',
        }}>
          #{rank}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: featured ? '1.1rem' : '1rem', marginBottom: '0.25rem' }}>
          {fullName}{mentor.credentials ? `, ${mentor.credentials}` : ''}
        </div>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: mentor.bio ? '0.5rem' : '0.75rem' }}>
          {mentor.current_role}{mentor.institution ? ` · ${mentor.institution}` : ''}
        </p>
        {mentor.bio && (
          <p style={{ color: '#cbd5e1', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '0.75rem' }}>
            {mentor.bio}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {(Array.isArray(mentor.specialty) ? mentor.specialty : []).slice(0, 3).map(s => (
            <span key={s} style={tagStyle('#1e2d45', '#3b82f6')}>{s}</span>
          ))}
          {(Array.isArray(mentor.identity) ? mentor.identity : []).slice(0, 2).map(id => (
            <span key={id} style={tagStyle('#1e2d30', '#34d399')}>{id}</span>
          ))}
        </div>
      </div>

      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <div style={{ fontSize: featured ? '1.5rem' : '1.25rem', fontWeight: 800, color: matchColor, marginBottom: '0.25rem' }}>
          {mentor.matchPercent}%
        </div>
        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '1rem' }}>match</div>
        <button
          onClick={onRequest}
          disabled={requested}
          style={{
            display: 'inline-block',
            background: requested ? '#0d2010' : featured ? '#60a5fa' : '#1a2744',
            color: requested ? '#4ade80' : featured ? '#0f1117' : '#60a5fa',
            border: requested ? '1px solid #4ade80' : featured ? 'none' : '1px solid #3b82f6',
            borderRadius: '6px',
            padding: '0.4rem 0.85rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: requested ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {requested ? 'Requested ✓' : 'Request →'}
        </button>
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
