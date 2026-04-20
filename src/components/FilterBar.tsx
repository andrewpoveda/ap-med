type FilterBarProps = {
  selectedIdentity: string;
  setSelectedIdentity: (value: string) => void;
  selectedSpecialty: string;
  setSelectedSpecialty: (value: string) => void;
  selectedOpenTo: string;
  setSelectedOpenTo: (value: string) => void;
  uniqueIdentities: string[];
  uniqueSpecialties: string[];
  uniqueOpenTo: string[];
};

export default function FilterBar({
  selectedIdentity,
  setSelectedIdentity,
  selectedSpecialty,
  setSelectedSpecialty,
  selectedOpenTo,
  setSelectedOpenTo,
  uniqueIdentities,
  uniqueSpecialties,
  uniqueOpenTo
}: FilterBarProps) {
  return (
    <div className="flex flex-col md:flex-row gap-4 mb-4">
      <div className="flex flex-col md:flex-row gap-4">
        <select
          value={selectedIdentity}
          onChange={(e) => setSelectedIdentity(e.target.value)}
          className="border border-neutral-300 dark:border-neutral-700 rounded p-2"
        >
          <option value="">All Identities</option>
          {uniqueIdentities.map(identity => (
            <option key={identity} value={identity}>{identity}</option>
          ))}
        </select>

        <select
          value={selectedSpecialty}
          onChange={(e) => setSelectedSpecialty(e.target.value)}
          className="border border-neutral-300 dark:border-neutral-700 rounded p-2"
        >
          <option value="">All Specialties</option>
          {uniqueSpecialties.map(specialty => (
            <option key={specialty} value={specialty}>{specialty}</option>
          ))}
        </select>
      </div>

      <select
        value={selectedOpenTo}
        onChange={(e) => setSelectedOpenTo(e.target.value)}
        className="border border-neutral-300 dark:border-neutral-700 rounded p-2"
      >
        <option value="">All Help Types</option>
        {uniqueOpenTo.map(openTo => (
          <option key={openTo} value={openTo}>{openTo}</option>
        ))}
      </select>
    </div>
  );
}
