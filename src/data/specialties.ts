// Canonical specialty vocabulary — the SINGLE source of truth shared by BOTH
// onboarding forms (mentor + mentee) and read by the matcher's specialty score.
// Keeping one list is what makes the specialty overlap actually match; the two
// forms previously drifted (e.g. "ENT" vs "Otolaryngology (ENT)") so overlap
// silently scored 0 on the matcher's heaviest weight.
//
// Collision rulings (mentor-form string ↔ mentee-form string → canonical):
//   OB-GYN              ↔ OB/GYN               → "OB/GYN"
//   ENT                 ↔ Otolaryngology (ENT) → "Otolaryngology (ENT)"
//   Orthopedics         ↔ Orthopedic Surgery   → "Orthopedic Surgery"
//   Other (not listed)  ↔ Other                → "Other"
//   Hematology/Oncology ↔ Oncology             → "Hematology/Oncology" (+ "Radiation Oncology" kept distinct)
// Existing rows are normalized to these strings via the Phase 0 migration.
export const SPECIALTIES = [
  "Anesthesiology",
  "Cardiology",
  "Cardiothoracic Surgery",
  "Critical Care",
  "Dermatology",
  "Emergency Medicine",
  "Endocrinology",
  "Family Medicine",
  "Gastroenterology",
  "General Surgery",
  "Hematology/Oncology",
  "Internal Medicine",
  "Interventional Radiology",
  "Nephrology",
  "Neurology",
  "Neurosurgery",
  "OB/GYN",
  "Ophthalmology",
  "Orthopedic Surgery",
  "Otolaryngology (ENT)",
  "Pathology",
  "Pediatrics",
  "PM&R / Physical Medicine",
  "Plastic Surgery",
  "Psychiatry",
  "Pulmonary",
  "Radiation Oncology",
  "Radiology",
  "Rheumatology",
  "Urology",
  "Not yet decided",
  "Other",
]
