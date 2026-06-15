"use client";

import { useState, useEffect } from "react";
import type { Mentor, ScoredMentor } from "@/types/mentor";
import MentorCard from "@/components/MentorCard";
import FilterBar from "@/components/FilterBar";

function SkeletonCard() {
  return (
    <div className="border border-neutral-700 rounded-xl p-5 bg-neutral-900 animate-pulse">
      <div className="flex gap-3">
        <div className="w-12 h-12 rounded-full bg-neutral-700 flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-4 bg-neutral-700 rounded w-1/2" />
          <div className="h-3 bg-neutral-800 rounded w-3/4" />
          <div className="h-3 bg-neutral-800 rounded w-full mt-2" />
          <div className="flex gap-1.5 pt-1">
            <div className="h-5 w-16 bg-neutral-700 rounded-full" />
            <div className="h-5 w-20 bg-neutral-700 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MentorsPage() {
  const [mentors, setMentors] = useState<(Mentor & { matchPercent?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdentity, setSelectedIdentity] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("");
  const [selectedOpenTo, setSelectedOpenTo] = useState("");

  useEffect(() => {
    fetch("/api/mentor")
      .then(r => r.json())
      .then(data => {
        const fetched: Mentor[] = data.mentors || [];

        let scoreMap: Record<string, number> = {};
        try {
          const raw = sessionStorage.getItem("matchResults");
          if (raw) {
            const results: ScoredMentor[] = JSON.parse(raw);
            results.forEach(m => { scoreMap[m.id] = m.matchPercent; });
          }
        } catch {}

        const merged = fetched.map(m => ({
          ...m,
          matchPercent: scoreMap[m.id],
        }));

        const hasScores = Object.keys(scoreMap).length > 0;
        if (hasScores) {
          merged.sort((a, b) => (b.matchPercent ?? 0) - (a.matchPercent ?? 0));
        } else {
          merged.sort((a, b) => a.last_name.localeCompare(b.last_name));
        }

        setMentors(merged);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const uniqueIdentities = Array.from(
    new Set(mentors.flatMap(m => Array.isArray(m.identity) ? m.identity : []))
  ).sort();
  const uniqueSpecialties = Array.from(
    new Set(mentors.flatMap(m => Array.isArray(m.specialty) ? m.specialty : []))
  ).sort();
  const uniqueOpenTo = Array.from(
    new Set(mentors.flatMap(m => Array.isArray(m.can_help_with) ? m.can_help_with : []))
  ).sort();

  const filtered = mentors.filter(m => {
    const identityMatch = selectedIdentity === "" || (Array.isArray(m.identity) && m.identity.includes(selectedIdentity));
    const specialtyMatch = selectedSpecialty === "" || (Array.isArray(m.specialty) && m.specialty.includes(selectedSpecialty));
    const openToMatch = selectedOpenTo === "" || (Array.isArray(m.can_help_with) && m.can_help_with.includes(selectedOpenTo));
    return identityMatch && specialtyMatch && openToMatch;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-[var(--global-text-color)]">
          AP MED Mentors
        </h1>
        <p className="text-neutral-300 mt-2">
          A growing directory of mentors supporting the next generation of physicians.
        </p>
      </div>

      <FilterBar
        selectedIdentity={selectedIdentity}
        setSelectedIdentity={setSelectedIdentity}
        selectedSpecialty={selectedSpecialty}
        setSelectedSpecialty={setSelectedSpecialty}
        selectedOpenTo={selectedOpenTo}
        setSelectedOpenTo={setSelectedOpenTo}
        uniqueIdentities={uniqueIdentities}
        uniqueSpecialties={uniqueSpecialties}
        uniqueOpenTo={uniqueOpenTo}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : filtered.map(mentor => <MentorCard key={mentor.id} mentor={mentor} />)
        }
      </div>
    </div>
  );
}
