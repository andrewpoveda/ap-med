"use client";

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import type { PublicMentor } from '@/types/mentor';
import EpisodeLink from '@/components/EpisodeLink';

type Props = {
  mentor: PublicMentor
}

const GOLD = '#c8a96e';

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function PhotoArea({ name, photoUrl, isGuest }: { name: string; photoUrl?: string; isGuest: boolean }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: 180, background: '#f0ece4' }}>
      {photoUrl ? (
        <Image src={photoUrl} alt={name} fill style={{ objectFit: 'cover' }} />
      ) : (
        <div style={{
          width: '100%', height: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: '#1a1a2e', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', fontWeight: 700, color: GOLD, userSelect: 'none',
          }}>
            {getInitials(name)}
          </div>
        </div>
      )}
      {isGuest && (
        <span style={{
          position: 'absolute', top: 10, right: 10,
          background: 'rgba(26,26,46,0.82)', color: GOLD,
          fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.55rem',
          borderRadius: '9999px', border: `1px solid rgba(200,169,110,0.45)`,
          backdropFilter: 'blur(2px)',
        }}>
          🎙 Guest
        </span>
      )}
    </div>
  );
}

export default function MentorCard({ mentor }: Props) {
  const fullName = `${mentor.first_name} ${mentor.last_name}`
  const displayName = mentor.credentials ? `${fullName}, ${mentor.credentials}` : fullName
  const isGuest = Boolean(mentor.episode_url && mentor.episode_url !== 'EMPTY')
  const specialties = Array.isArray(mentor.specialty) ? mentor.specialty : []
  const identities = Array.isArray(mentor.identity) ? mentor.identity : []

  const [expanded, setExpanded] = useState(false)
  const [isClamped, setIsClamped] = useState(false)
  const bioRef = useRef<HTMLParagraphElement>(null)

  // Detect whether the (clamped) bio actually overflows 3 lines, so the
  // "Read more" toggle only shows on cards that need it.
  useEffect(() => {
    const el = bioRef.current
    if (el && !expanded) setIsClamped(el.scrollHeight > el.clientHeight + 1)
  }, [mentor.bio, expanded])

  return (
    <div
      className="border border-[#e8e4dc] rounded-xl bg-white overflow-hidden hover:border-[#d8d0c0] transition flex flex-col"
      style={{ boxShadow: '0 1px 2px rgba(26,26,46,0.04), 0 6px 16px rgba(26,26,46,0.06)' }}
    >
      <PhotoArea name={fullName} photoUrl={mentor.photo_url} isGuest={isGuest} />

      <div className="p-5">
        <div className="flex items-center">
          <h2 className="text-base font-semibold text-[#1a1a2e] leading-snug">{displayName}</h2>
          <EpisodeLink mentor={mentor} />
        </div>
        <p className="text-sm text-[#6b6b6b] mt-0.5">
          {mentor.current_role}{mentor.institution ? ` · ${mentor.institution}` : ''}
        </p>

        {mentor.bio && (
          <>
            <p
              ref={bioRef}
              className="text-sm text-[#4a4a5a] mt-2 leading-relaxed"
              style={expanded ? undefined : {
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {mentor.bio}
            </p>
            {(isClamped || expanded) && (
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="text-xs font-semibold mt-1 hover:underline"
                style={{ color: '#8a6a2f', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </>
        )}

        <div className="flex flex-wrap gap-1.5 mt-3">
          {specialties.slice(0, 3).map(s => (
            <span
              key={`spec-${s}`}
              className="px-2 py-0.5 text-xs rounded-full"
              style={{ background: 'rgba(91,124,250,0.14)', color: '#4255b5' }}
            >
              {s}
            </span>
          ))}
          {identities.slice(0, 2).map(id => (
            <span
              key={`id-${id}`}
              className="px-2 py-0.5 text-xs rounded-full"
              style={{ background: 'rgba(200,169,110,0.22)', color: '#8a6a2f' }}
            >
              {id}
            </span>
          ))}
          {mentor.current_stage && (
            <span
              className="px-2 py-0.5 text-xs rounded-full"
              style={{ background: 'rgba(60,160,110,0.16)', color: '#2f8f5f' }}
            >
              {mentor.current_stage}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
