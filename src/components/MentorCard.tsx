"use client";

import Image from 'next/image';
import { track } from '@vercel/analytics';
import type { Mentor } from '@/types/mentor';

type Props = {
  mentor: Mentor & { matchPercent?: number }
}

const AVATAR_COLORS = [
  ['#1a2744', '#60a5fa'],
  ['#14281a', '#4ade80'],
  ['#2a1a2e', '#c084fc'],
  ['#2a1f14', '#fb923c'],
  ['#1a2434', '#38bdf8'],
];

function Avatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  const initials = name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const colorIndex = name.charCodeAt(0) % AVATAR_COLORS.length;
  const [bg, fg] = AVATAR_COLORS[colorIndex];

  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt={name}
        width={48}
        height={48}
        style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{
      width: 48, height: 48, borderRadius: '50%', background: bg, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '1rem', fontWeight: 700, color: fg, userSelect: 'none',
    }}>
      {initials}
    </div>
  );
}

export default function MentorCard({ mentor }: Props) {
  const fullName = `${mentor.first_name} ${mentor.last_name}`
  const displayName = mentor.credentials ? `${fullName}, ${mentor.credentials}` : fullName
  const matchColor = mentor.matchPercent !== undefined
    ? mentor.matchPercent >= 75 ? '#4ade80'
    : mentor.matchPercent >= 50 ? '#60a5fa'
    : '#94a3b8'
    : undefined

  return (
    <div className="border border-neutral-700 rounded-xl p-5 bg-neutral-900 hover:border-neutral-600 transition">
      <div className="flex gap-3 items-start">
        <Avatar name={fullName} photoUrl={mentor.photo_url} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white leading-snug">{displayName}</h2>
              <p className="text-sm text-neutral-400 mt-0.5">
                {mentor.current_role}{mentor.institution ? ` · ${mentor.institution}` : ''}
              </p>
            </div>
            {mentor.matchPercent !== undefined && (
              <div className="text-right flex-shrink-0">
                <div style={{ color: matchColor, fontWeight: 800, fontSize: '1.1rem', lineHeight: 1 }}>
                  {mentor.matchPercent}%
                </div>
                <div className="text-xs text-neutral-500">match</div>
              </div>
            )}
          </div>

          {mentor.bio && (
            <p className="text-sm text-neutral-300 mt-2 leading-relaxed">{mentor.bio}</p>
          )}

          <div className="flex flex-wrap gap-1.5 mt-3">
            {(Array.isArray(mentor.specialty) ? mentor.specialty : []).slice(0, 3).map(s => (
              <span key={s} className="px-2 py-0.5 text-xs rounded-full bg-blue-950 text-blue-300">{s}</span>
            ))}
            {(Array.isArray(mentor.identity) ? mentor.identity : []).slice(0, 2).map(id => (
              <span key={id} className="px-2 py-0.5 text-xs rounded-full bg-emerald-950 text-emerald-300">{id}</span>
            ))}
          </div>

          {mentor.episode_url && (
            <a
              href={mentor.episode_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('episode_click', { name: fullName })}
              className="mt-3 inline-block px-3 py-1.5 text-xs rounded bg-neutral-700 text-neutral-200 hover:bg-neutral-600 transition"
            >
              Listen to Episode
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
