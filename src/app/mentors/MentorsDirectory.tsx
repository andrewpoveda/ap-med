"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Mentor } from "@/types/mentor";
import MentorCard from "@/components/MentorCard";
import FilterBar from "@/components/FilterBar";

function SkeletonCard() {
  return (
    <div className="border border-[#e8e4dc] rounded-xl bg-white overflow-hidden animate-pulse">
      <div className="w-full h-[180px] bg-[#ece7dd]" />
      <div className="p-5 space-y-2">
        <div className="h-4 bg-[#e4ded3] rounded w-1/2" />
        <div className="h-3 bg-[#ece7dd] rounded w-3/4" />
        <div className="h-3 bg-[#ece7dd] rounded w-full mt-2" />
        <div className="flex gap-1.5 pt-1">
          <div className="h-5 w-16 bg-[#e4ded3] rounded-full" />
          <div className="h-5 w-20 bg-[#e4ded3] rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default function MentorsDirectory() {
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdentity, setSelectedIdentity] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("");
  const [selectedOpenTo, setSelectedOpenTo] = useState("");

  useEffect(() => {
    // Browse-only directory: just list mentors alphabetically. Compatibility
    // scores are intentionally NOT shown here — they only appear on the results
    // page after a mentee completes the onboarding form and the matcher runs.
    fetch("/api/mentor")
      .then(r => r.json())
      .then(data => {
        const fetched: Mentor[] = data.mentors || [];
        fetched.sort((a, b) => a.last_name.localeCompare(b.last_name));
        setMentors(fetched);
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-[var(--global-text-color)]">
            AP MED Mentors
          </h1>
          <p className="text-[#6b6b6b] mt-2 max-w-xl">
            Browse our mentors below. When you&apos;re ready, get matched and we&apos;ll
            surface your compatibility with each one.
          </p>
        </div>
        <Link
          href="/mentee-onboarding"
          className="self-start sm:self-auto whitespace-nowrap"
          style={{
            background: "#c8a96e",
            color: "#1a1a2e",
            padding: "0.7rem 1.5rem",
            borderRadius: "8px",
            fontWeight: 600,
            fontSize: "0.95rem",
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Get Matched →
        </Link>
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
