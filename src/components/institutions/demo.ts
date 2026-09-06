/** Illustrative console data. Not customer, partnership, or outcome statistics. */

/** A real named program running on AP MED — not a second product. */
export const EXAMPLE_PROGRAM = {
  name: "Ascenso",
  organization: "LMSA Northeast",
  label: "Ascenso · LMSA Northeast",
  caption: "LMSA Northeast’s mentorship cohort",
} as const;

export const MATCH_WEIGHTS = [
  { key: "identity", label: "Identity / background", weight: 40 },
  { key: "specialty", label: "Specialty interest", weight: 35 },
  { key: "needs", label: "Mentorship needs", weight: 25 },
] as const;

export const TRACKS = [
  { id: "ms_premed", label: "Med student → Premed", pairs: 10, pending: 2 },
  { id: "resident_ms", label: "Resident → Med student", pairs: 10, pending: 1 },
  { id: "attending_ms", label: "Attending → Med student", pairs: 5, pending: 0 },
  { id: "attending_resident", label: "Attending → Resident", pairs: 5, pending: 1 },
] as const;

export const APPLICATIONS = [
  {
    name: "Elena Voss",
    role: "Mentee",
    track: "Med student → Premed",
    institution: "State University",
    status: "submitted" as const,
    submitted: "Sep 2",
  },
  {
    name: "Dr. Marcus Hale",
    role: "Mentor",
    track: "Attending → Med student",
    institution: "County Medical Center",
    status: "submitted" as const,
    submitted: "Sep 1",
  },
  {
    name: "Priya Shah",
    role: "Mentee",
    track: "Resident → Med student",
    institution: "Riverside SOM",
    status: "approved" as const,
    submitted: "Aug 28",
  },
  {
    name: "Jordan Ellis",
    role: "Mentor",
    track: "Med student → Premed",
    institution: "Riverside SOM",
    status: "waitlisted" as const,
    submitted: "Aug 27",
  },
];

export const CANDIDATES = [
  {
    mentor: "Jordan Ellis",
    mentee: "Elena Voss",
    track: "Med student → Premed",
    score: 92,
    breakdown: { identity: 100, specialty: 86, needs: 88 },
    overlap: ["First-generation", "Internal medicine", "Applications"],
  },
  {
    mentor: "Amina Cole",
    mentee: "Luis Ortega",
    track: "Med student → Premed",
    score: 84,
    breakdown: { identity: 75, specialty: 100, needs: 80 },
    overlap: ["Primary care", "MCAT strategy"],
  },
  {
    mentor: "Dr. Hale",
    mentee: "Priya Shah",
    track: "Attending → Med student",
    score: 79,
    breakdown: { identity: 50, specialty: 100, needs: 100 },
    overlap: ["Cardiology", "Research planning"],
  },
];

export const MILESTONES = [
  { name: "Elena Voss", role: "Mentee", orientation: true, training: true, account: true },
  { name: "Luis Ortega", role: "Mentee", orientation: true, training: false, account: true },
  { name: "Priya Shah", role: "Mentee", orientation: true, training: true, account: true },
  { name: "Jordan Ellis", role: "Mentor", orientation: true, training: true, account: true },
  { name: "Amina Cole", role: "Mentor", orientation: true, training: false, account: true },
  { name: "Dr. Marcus Hale", role: "Mentor", orientation: false, training: false, account: true },
];

export const SESSIONS = [
  { pair: "Ellis · Voss", when: "Tue · 6:30 PM", mode: "Video", status: "Booked" },
  { pair: "Cole · Ortega", when: "Wed · 12:15 PM", mode: "Campus", status: "Booked" },
  { pair: "Hale · Shah", when: "Thu · 7:00 PM", mode: "Phone", status: "Needs log" },
];

export const GOALS = [
  { pair: "Ellis · Voss", title: "Complete AMCAS activities list", status: "Active" },
  { pair: "Cole · Ortega", title: "Two MCAT CARS blocks / week", status: "Active" },
  { pair: "Hale · Shah", title: "Identify a summer research lab", status: "Done" },
];

export const MEETINGS_BY_MONTH = [
  { month: "Sep", count: 18 },
  { month: "Oct", count: 24 },
  { month: "Nov", count: 21 },
  { month: "Dec", count: 11 },
  { month: "Jan", count: 19 },
  { month: "Feb", count: 22 },
];

export const PAIRS = [
  { mentor: "Ellis", mentee: "Voss", meetings: 6, last: "Aug 28", quiet: false },
  { mentor: "Cole", mentee: "Ortega", meetings: 4, last: "Aug 21", quiet: false },
  { mentor: "Hale", mentee: "Shah", meetings: 1, last: "Jul 12", quiet: true },
  { mentor: "Park", mentee: "Diaz", meetings: 5, last: "Aug 30", quiet: false },
];

export const VERSUS = [
  {
    manual: "Applications in a form nobody owns by spring",
    platform: "Role- and track-specific applications, reviewed by your staff",
  },
  {
    manual: "Matching as a weekend in a color-coded sheet",
    platform: "Track-constrained scores. Reviewers select. Nothing auto-goes-live",
  },
  {
    manual: "Calendly for time, inboxes for follow-ups, a second place for whether it happened",
    platform: "Sessions, two-sided logs, goals, and a digest in the same cohort",
  },
  {
    manual: "A slide deck reconstructed the week before the annual meeting",
    platform: "Analytics, CSV export, and a printable summary",
  },
] as const;

export const HERO_FACTS = [
  { label: "Recruit", value: "Applications your staff review. Nothing auto-enrolls." },
  { label: "Match", value: "Track-constrained scores. Reviewers select the pair." },
  { label: "Engage", value: "Sessions, logs, goals, and a digest for quiet pairs." },
  { label: "Measure", value: "Analytics, CSV export, and a printable summary." },
];
