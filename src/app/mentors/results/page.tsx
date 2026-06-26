'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ScoredMentor } from '@/types/mentor'
import EpisodeLink from '@/components/EpisodeLink'

type MenteeData = {
  full_name: string
  email: string
  school: string
  current_stage: string
  interests: string[]
  help_with: string[]
  identity: string[]
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
  const [testMode, setTestMode] = useState(false)

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
      setTestMode(sessionStorage.getItem('matchTestMode') === '1')
      setLoaded(true)
    } catch {
      router.replace('/mentee-onboarding')
    }
  }, [router])

  const handleRequest = async (mentor: ScoredMentor) => {
    setRequestedIds(prev => new Set([...prev, mentor.id]))
    if (!menteeData) return
    try {
      await fetch(`/api/notify${testMode ? '?test=1' : ''}`, {
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
      <div style={{ minHeight: '100vh', background: '#faf8f4', color: '#1a1a2e', fontFamily: 'inherit' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
          <div style={{ height: '0.75rem', width: '8rem', background: '#ffffff', borderRadius: 4, marginBottom: '0.75rem' }} className="animate-pulse" />
          <div style={{ height: '2rem', width: '55%', background: '#ffffff', borderRadius: 4, marginBottom: '0.75rem' }} className="animate-pulse" />
          <div style={{ height: '0.875rem', width: '70%', background: '#ffffff', borderRadius: 4, marginBottom: '3rem' }} className="animate-pulse" />
          {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f4', color: '#1a1a2e', fontFamily: 'inherit' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
        <p style={{ color: '#c8a96e', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          AP MED MENTORS
        </p>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          Your top matches, {firstName}
        </h1>
        <p style={{ color: '#6b6b6b', marginBottom: testMode ? '1.5rem' : '3rem', lineHeight: 1.6 }}>
          Based on your specialty interests, background, and what you need help with.
        </p>

        {testMode && (
          <div style={{ marginBottom: '3rem', padding: '0.75rem 1rem', background: '#fdf6e3', border: '1px solid #e0c060', borderRadius: '8px', color: '#8a6d1f', fontSize: '0.85rem', lineHeight: 1.5 }}>
            🧪 <strong>Test mode</strong> — requesting a mentor here will <strong>not send any email</strong>.
          </div>
        )}

        {top3.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Best matches</span>
              <span style={{ background: '#f5efe2', color: '#c8a96e', borderRadius: '9999px', padding: '0.2rem 0.6rem', fontSize: '0.75rem', fontWeight: 600 }}>
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
            <hr style={{ border: 'none', borderTop: '1px solid #e8e4dc', marginBottom: '2rem' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showAll ? '1.5rem' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Browse all mentors</span>
                <span style={{ background: '#ffffff', color: '#6b6b6b', borderRadius: '9999px', padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
                  {rest.length} more
                </span>
              </div>
              <button
                onClick={() => setShowAll(v => !v)}
                style={{
                  background: '#ffffff', border: '1px solid #e8e4dc', borderRadius: '6px',
                  color: '#c8a96e', padding: '0.4rem 0.85rem', fontSize: '0.8rem',
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
          <div style={{ textAlign: 'center', padding: '4rem 0', color: '#6b6b6b' }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>No mentors found yet.</p>
            <Link href="/mentors" style={{ color: '#c8a96e' }}>Browse the directory →</Link>
          </div>
        )}
      </div>
    </div>
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
      width: 48, height: 48, borderRadius: '50%', background: '#1a1a2e', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '1rem', fontWeight: 700, color: '#c8a96e',
    }}>
      {initials}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e8e4dc', borderRadius: '12px', padding: '1.5rem', display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#e8e4dc', flexShrink: 0 }} className="animate-pulse" />
      <div style={{ flex: 1 }}>
        <div style={{ height: '1rem', width: '40%', background: '#e8e4dc', borderRadius: 4, marginBottom: '0.5rem' }} className="animate-pulse" />
        <div style={{ height: '0.75rem', width: '60%', background: '#ffffff', borderRadius: 4, marginBottom: '0.5rem' }} className="animate-pulse" />
        <div style={{ height: '0.75rem', width: '90%', background: '#ffffff', borderRadius: 4, marginBottom: '0.4rem' }} className="animate-pulse" />
        <div style={{ height: '0.75rem', width: '80%', background: '#ffffff', borderRadius: 4 }} className="animate-pulse" />
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
    mentor.matchPercent >= 75 ? '#2f8f5f' :
    mentor.matchPercent >= 50 ? '#b8923f' :
    '#9a948a'

  const fullName = `${mentor.first_name} ${mentor.last_name}`

  return (
    <div
      className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5"
      style={{
        background: featured ? '#fffdf9' : '#ffffff',
        border: `1px solid ${featured ? '#e0cfa3' : '#e8e4dc'}`,
        boxShadow: '0 1px 2px rgba(26,26,46,0.04), 0 6px 16px rgba(26,26,46,0.06)',
        borderRadius: '12px',
        padding: featured ? '1.5rem' : '1.25rem',
      }}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-5">
        <Avatar name={fullName} photoUrl={mentor.photo_url} />

        {rank && (
          <div style={{
            flexShrink: 0, width: '2rem', height: '2rem', borderRadius: '50%',
            background: rank === 1 ? '#f5efe2' : '#ffffff',
            border: `1px solid ${rank === 1 ? '#c8a96e' : '#e8e4dc'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.8rem', fontWeight: 700, color: rank === 1 ? '#c8a96e' : '#6b6b6b',
          }}>
            #{rank}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem', minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: featured ? '1.1rem' : '1rem', minWidth: 0, overflowWrap: 'anywhere' }}>
              {fullName}{mentor.credentials ? `, ${mentor.credentials}` : ''}
            </span>
            <EpisodeLink mentor={mentor} />
          </div>
          <p style={{ color: '#6b6b6b', fontSize: '0.875rem', marginBottom: mentor.bio ? '0.5rem' : '0.75rem' }}>
            {mentor.current_role}{mentor.institution ? ` · ${mentor.institution}` : ''}
          </p>
          {mentor.bio && (
            <p style={{ color: '#4a4a5a', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '0.75rem' }}>
              {mentor.bio}
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {(Array.isArray(mentor.specialty) ? mentor.specialty : []).slice(0, 3).map(s => (
              <span key={s} style={tagStyle('rgba(91,124,250,0.14)', '#4255b5')}>{s}</span>
            ))}
            {(Array.isArray(mentor.identity) ? mentor.identity : []).slice(0, 2).map(id => (
              <span key={id} style={tagStyle('rgba(60,160,110,0.16)', '#2f8f5f')}>{id}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex w-full shrink-0 items-center justify-between sm:w-auto sm:flex-col sm:items-end sm:justify-start">
        <div className="text-left sm:text-right">
          <div style={{ fontSize: featured ? '1.5rem' : '1.25rem', fontWeight: 800, color: matchColor, marginBottom: '0.25rem' }}>
            {mentor.matchPercent}%
          </div>
          <div style={{ fontSize: '0.7rem', color: '#9a948a' }}>match</div>
        </div>
        <button
          onClick={onRequest}
          disabled={requested}
          className="sm:mt-4"
          style={{
            display: 'inline-block',
            background: requested ? '#e6f4ec' : featured ? '#c8a96e' : '#f5efe2',
            color: requested ? '#2f8f5f' : featured ? '#1a1a2e' : '#8a6a2f',
            border: requested ? '1px solid #9ed9b8' : featured ? 'none' : '1px solid #c8a96e',
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
