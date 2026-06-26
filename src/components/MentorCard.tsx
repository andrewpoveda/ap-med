"use client";

import Image from 'next/image';
import type { Mentor } from '@/types/mentor';
import EpisodeLink from '@/components/EpisodeLink';

type Props = {
  mentor: Mentor
}

const GOLD = '#c8a96e';

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function PhotoArea({ name, photoUrl, isGuest }: { name: string; photoUrl?: string; isGuest: boolean }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: 180, background: '#11151f' }}>
      {photoUrl ? (
        <Image src={photoUrl} alt={name} fill style={{ objectFit: 'cover' }} />
      ) : (
        <div style={{
          width: '100%', height: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: '#1a1f2e', display: 'flex',
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
          background: 'rgba(10,15,30,0.78)', color: GOLD,
          fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.55rem',
          borderRadius: '9999px', border: `1px solid rgba(200,169,110,0.4)`,
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

  return (
    <div className="border border-neutral-700 rounded-xl bg-neutral-900 overflow-hidden hover:border-neutral-600 transition flex flex-col">
      <PhotoArea name={fullName} photoUrl={mentor.photo_url} isGuest={isGuest} />

      <div className="p-5">
        <div className="flex items-center">
          <h2 className="text-base font-semibold text-white leading-snug">{displayName}</h2>
          <EpisodeLink mentor={mentor} />
        </div>
        <p className="text-sm text-neutral-400 mt-0.5">
          {mentor.current_role}{mentor.institution ? ` · ${mentor.institution}` : ''}
        </p>

        {mentor.bio && (
          <p
            className="text-sm text-neutral-300 mt-2 leading-relaxed"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {mentor.bio}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5 mt-3">
          {specialties.slice(0, 3).map(s => (
            <span
              key={`spec-${s}`}
              className="px-2 py-0.5 text-xs rounded-full"
              style={{ background: 'rgba(99,132,255,0.12)', color: '#a0b4ff' }}
            >
              {s}
            </span>
          ))}
          {identities.slice(0, 2).map(id => (
            <span
              key={`id-${id}`}
              className="px-2 py-0.5 text-xs rounded-full"
              style={{ background: 'rgba(200,169,110,0.10)', color: GOLD }}
            >
              {id}
            </span>
          ))}
          {mentor.current_stage && (
            <span
              className="px-2 py-0.5 text-xs rounded-full"
              style={{ background: 'rgba(100,200,150,0.10)', color: '#7dd4a8' }}
            >
              {mentor.current_stage}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
