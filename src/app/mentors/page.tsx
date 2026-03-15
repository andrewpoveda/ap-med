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
    <div className="p-4 space-y-6">
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

      {filteredMentors.map((mentor) => (
        <MentorCard key={mentor.name} mentor={mentor} />
      ))}
    </div>
  );
}
