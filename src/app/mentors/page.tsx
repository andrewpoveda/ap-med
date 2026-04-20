"use client";

import { useState } from "react";
import mentors from "@/data/mentors.json";
import MentorCard from "@/components/MentorCard";
import FilterBar from "@/components/FilterBar";

export default function MentorsPage() {
  const [selectedIdentity, setSelectedIdentity] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("");
  const [selectedOpenTo, setSelectedOpenTo] = useState("");

  // Compute unique options
  const uniqueIdentities = Array.from(new Set(mentors.flatMap(m => m.identity))).sort();
  const uniqueSpecialties = Array.from(new Set(mentors.map(m => m.specialty))).sort();
  const uniqueOpenTo = Array.from(new Set(mentors.flatMap(m => m.openTo))).sort();

  const filteredMentors = mentors.filter((mentor) => {
    const identityMatch =
      selectedIdentity === "" || mentor.identity.includes(selectedIdentity);

    const specialtyMatch =
      selectedSpecialty === "" || mentor.specialty === selectedSpecialty;

    const openToMatch =
      selectedOpenTo === "" || mentor.openTo.includes(selectedOpenTo);

    return identityMatch && specialtyMatch && openToMatch;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">

      {/* Page Header */}
      <div className="w-full">
        <h1 className="text-4xl font-bold tracking-tight text-[var(--global-text-color)]">
          AP: MED Mentors
        </h1>
        <p className="text-black dark:text-neutral-300 mt-2">
          A growing directory of mentors supporting the next generation of physicians.
        </p>
      </div>

      {/* Filters */}
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

      {/* Mentor Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMentors.map((mentor) => (
          <MentorCard key={mentor.name} mentor={mentor} />
        ))}
      </div>
    </div>
  );
}
