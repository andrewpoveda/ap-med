"use client";

import { useState, useRef } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { SPECIALTIES } from "@/data/specialties";

type FormData = {
  firstName: string;
  lastName: string;
  credentials: string;
  role: string;
  institution: string;
  linkedin: string;
  episode: string;
  bio: string;
  identity: string[];
  stage: string;
  specialties: string[];
  specialtyOther: string;
  helpWith: string[];
  capacity: string;
  contactMethods: string[];
  schedulingLink: string;
  consent1: boolean;
  consent2: boolean;
  email: string;
  notes: string;
};

const IDENTITY_OPTIONS = [
  "First-generation",
  "Latino / Hispanic",
  "Black / African American",
  "Asian / Pacific Islander",
  "Native American",
  "Low-income background",
  "LGBTQ+",
  "International / IMG",
  "Non-traditional student",
  "Prefer not to say",
];

const STAGE_OPTIONS = [
  "Pre-med / Undergrad",
  "Post-bacc",
  "MD / DO Student",
  "Resident",
  "Fellow",
  "Attending Physician",
  "Faculty / Dean / Administrator",
];

// Specialty options come from the shared canonical list (src/data/specialties.ts)
// so the mentor + mentee forms emit identical strings — see SPECIALTIES import.
const SPECIALTY_OPTIONS = SPECIALTIES;

const HELP_OPTIONS = [
  "General guidance",
  "Personal statement review",
  "Application advice",
  "Mock interviews",
  "MCAT advice",
  "Research guidance",
  "Clinical / shadowing advice",
  "Specialty exploration",
  "Identity mentorship",
  "Residency application",
];

const CONTACT_OPTIONS = ["Email", "LinkedIn", "Scheduling link", "AP MED form only"];

const CAPACITY_OPTIONS = ["1", "2–3", "4 or more", "None right now — add me to the waitlist"];

const SECTION_LABELS = [
  "Basic info",
  "Your background",
  "How you can help",
  "Final step",
];

const CheckItem = ({
  label,
  name,
  checked,
  onChange,
}: {
  label: string;
  name: string;
  checked: boolean;
  onChange: () => void;
}) => (
  <label
    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-all ${
      checked
        ? "border-[var(--global-theme-color)] bg-blue-950 text-blue-200"
        : "border-gray-700 text-neutral-300 hover:border-gray-500"
    }`}
  >
    <input
      type="checkbox"
      name={name}
      value={label}
      checked={checked}
      onChange={onChange}
      className="accent-[var(--global-theme-color)]"
    />
    {label}
  </label>
);

const RadioItem = ({ label, name, selected, onChange }: { label: string; name: string; selected: boolean; onChange: () => void }) => (
  <label
    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer text-sm transition-all ${
      selected
        ? "border-[var(--global-theme-color)] bg-blue-950 text-blue-200"
        : "border-gray-700 text-neutral-300 hover:border-gray-500"
    }`}
  >
    <input
      type="radio"
      name={name}
      value={label}
      checked={selected}
      onChange={onChange}
      className="accent-[var(--global-theme-color)]"
    />
    {label}
  </label>
);

const Field = ({ label, error, optional, hint, children }: { label: string; error?: string; optional?: boolean; hint?: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <label className="text-sm font-medium text-neutral-200">
      {label}
      {optional && <span className="text-neutral-500 font-normal ml-1">(optional)</span>}
    </label>
    {hint && <p className="text-xs text-neutral-500">{hint}</p>}
    {children}
    {error && <p className="text-xs text-red-400">{error}</p>}
  </div>
);

export default function MentorOnboardingPage() {
  const [section, setSection] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const turnstileToken = useRef<string | null>(null);

  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    credentials: "",
    role: "",
    institution: "",
    linkedin: "",
    episode: "",
    bio: "",
    identity: [],
    stage: "",
    specialties: [],
    specialtyOther: "",
    helpWith: [],
    capacity: "",
    contactMethods: [],
    schedulingLink: "",
    consent1: false,
    consent2: false,
    email: "",
    notes: "",
  });

  const setText = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((err) => { const n = { ...err }; delete n[field]; return n; });
  };

  const toggleArray = (field: "identity" | "specialties" | "helpWith" | "contactMethods", value: string) => {
    setForm((f) => {
      const arr = f[field] as string[];
      const newArr = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      // If removing the 'Other' specialty, clear the free-text field
      if (field === "specialties") {
        return { ...f, [field]: newArr, ...(newArr.includes("Other") ? {} : { specialtyOther: "" }) };
      }
      return { ...f, [field]: newArr };
    });
    setErrors((err) => { const n = { ...err }; delete n[field]; return n; });
  };

  const setRadio = (field: "stage" | "capacity", value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((err) => { const n = { ...err }; delete n[field]; return n; });
  };

  const validate = (idx: number): boolean => {
    const e: Record<string, string> = {};
    if (idx === 0) {
      if (!form.firstName.trim()) e.firstName = "Required";
      if (!form.lastName.trim()) e.lastName = "Required";
      if (!form.role.trim()) e.role = "Required";
      if (!form.institution.trim()) e.institution = "Required";
    }
    if (idx === 1) {
      if (form.bio.trim().length < 20) e.bio = "Please write at least a few sentences";
      if (!form.stage) e.stage = "Please select one";
    }
    if (idx === 2) {
      if (form.helpWith.length === 0) e.helpWith = "Please select at least one";
      if (!form.capacity) e.capacity = "Please select one";
    }
    if (idx === 3) {
      if (!form.consent1) e.consent1 = "Required to be listed";
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Please enter a valid email";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = async () => {
    // if (!validate(section)) return;
    if (section < 3) {
      setSection((s) => s + 1);
      window.scrollTo(0, 0);
    } else {
      try {
        console.log("FORM CONTENTS:", form);

        const response = await fetch('/api/mentor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            turnstile_token: turnstileToken.current,
            first_name: form.firstName,
            last_name: form.lastName,
            credentials: form.credentials,
            current_role: form.role,
            institution: form.institution,
            linkedin_url: form.linkedin,
            episode_url: form.episode,
            bio: form.bio,
            identity: form.identity,
            current_stage: form.stage,
            specialty: form.specialties,
            can_help_with: form.helpWith,
            mentee_capacity: form.capacity,
            contact_method: form.contactMethods,
            scheduling_url: form.schedulingLink,
            open_to_podcast: form.consent2,
            email: form.email,
            notes: form.notes,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          console.error('Mentor API error:', data?.error || data)
          alert('Something went wrong, please try again.')
          return
        }

        setSubmitted(true)
      } catch (err) {
        console.error(err)
        alert('Something went wrong, please try again.')
      }
    }
  };

  const handleBack = () => { setSection((s) => s - 1); window.scrollTo(0, 0); };

  const themeBlue = "var(--global-theme-color)";
  const inputClass = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-[var(--global-theme-color)] transition-colors";

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <div className="text-5xl mb-6">✓</div>
        <h2 className="text-3xl font-bold text-white mb-4">You&apos;re on the list</h2>
        <p className="text-neutral-400 leading-relaxed">
          Thanks for joining AP MED Mentors. Andrew will review your submission and reach out once your profile is live — usually within a few days.
        </p>
      </div>
    );
  }


  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-8 border-b border-gray-700 pb-6">
        <p className="text-xs tracking-widest uppercase text-neutral-500 mb-1">AP MED Mentors</p>
        <h1 className="text-3xl font-bold text-white mb-2">Mentor onboarding</h1>
        <p className="text-sm text-neutral-400">
          Join a free mentorship directory connecting pre-med students with healthcare professionals. Takes about 5–10 minutes.
        </p>
      </div>

      {/* Progress */}
      <div className="flex gap-1.5 mb-2">
        {SECTION_LABELS.map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all"
            style={{ background: i <= section ? themeBlue : "#374151", opacity: i < section ? 0.4 : 1 }}
          />
        ))}
      </div>
      <p className="text-xs text-neutral-500 mb-8">Section {section + 1} of 4 — {SECTION_LABELS[section]}</p>

      {/* Section 0: Basic Info */}
      {section === 0 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold text-white mb-1">Basic info</h2>
            <p className="text-sm text-neutral-400 mb-6">This is what will appear on your public profile.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="First name" error={errors.firstName}>
              <input name="firstName" className={inputClass} placeholder="Andrew" value={form.firstName} onChange={setText("firstName")} />
            </Field>
            <Field label="Last name" error={errors.lastName}>
              <input name="lastName" className={inputClass} placeholder="Poveda" value={form.lastName} onChange={setText("lastName")} />
            </Field>
          </div>
          <Field label="Credentials" optional hint="e.g. MD, DO, MS, MPH — appears after your name">
            <input name="credentials" className={inputClass} placeholder="MD" value={form.credentials} onChange={setText("credentials")} />
          </Field>
          <Field label="Current role / title" error={errors.role}>
            <input name="role" className={inputClass} placeholder="Internal Medicine Resident" value={form.role} onChange={setText("role")} />
          </Field>
          <Field label="Institution / Hospital / School" error={errors.institution}>
            <input name="institution" className={inputClass} placeholder="Brigham and Women's Hospital" value={form.institution} onChange={setText("institution")} />
          </Field>
          <Field label="LinkedIn URL" optional>
            <input name="linkedin" className={inputClass} placeholder="https://linkedin.com/in/yourname" value={form.linkedin} onChange={setText("linkedin")} />
          </Field>
          <Field label="Your AP MED episode link" optional hint="Leave blank if you haven't been a guest yet">
            <input name="episode" className={inputClass} placeholder="https://open.spotify.com/episode/..." value={form.episode} onChange={setText("episode")} />
          </Field>
        </div>
      )}

      {/* Section 1: Background */}
      {section === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-white mb-1">Your background</h2>
            <p className="text-sm text-neutral-400 mb-6">Help students understand who you are and why you want to mentor.</p>
          </div>
          <Field label="Bio" error={errors.bio} hint="3–5 sentences about your path to medicine and what motivates you to mentor. This appears on your public profile.">
            <textarea
              name="bio"
              className={`${inputClass} min-h-[100px] resize-y`}
              placeholder="I'm a first-gen Latino MD student at..."
              value={form.bio}
              onChange={setText("bio")}
            />
          </Field>

          <div className="border-t border-gray-700 pt-5">
            <p className="text-sm font-medium text-neutral-200 mb-1">Identity <span className="text-neutral-500 font-normal">(optional)</span></p>
            <p className="text-xs text-neutral-500 mb-3">Select any that apply — helps students find mentors who share their background.</p>
            <div className="grid grid-cols-2 gap-2">
              {IDENTITY_OPTIONS.map((opt) => (
                <CheckItem key={opt} name="identity" label={opt} checked={form.identity.includes(opt)} onChange={() => toggleArray("identity", opt)} />
              ))}
            </div>
          </div>

          <div className="border-t border-gray-700 pt-5">
            <p className="text-sm font-medium text-neutral-200 mb-3">Your current stage</p>
            {errors.stage && <p className="text-xs text-red-400 mb-2">{errors.stage}</p>}
            <div className="flex flex-col gap-2">
              {STAGE_OPTIONS.map((opt) => (
                <RadioItem key={opt} name="stage" label={opt} selected={form.stage === opt} onChange={() => setRadio("stage", opt)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Section 2: How you can help */}
      {section === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-white mb-1">How you can help</h2>
            <p className="text-sm text-neutral-400 mb-6">Tell students what you&apos;re able to offer and how much time you have.</p>
          </div>

          <div>
            <p className="text-sm font-medium text-neutral-200 mb-1">Specialty <span className="text-neutral-500 font-normal">(optional)</span></p>
            <p className="text-xs text-neutral-500 mb-3">Current or intended — select all that apply</p>
            <div className="grid grid-cols-2 gap-2">
              {SPECIALTY_OPTIONS.map((opt) => (
                <CheckItem key={opt} name="specialties" label={opt} checked={form.specialties.includes(opt)} onChange={() => toggleArray("specialties", opt)} />
              ))}
            </div>
            {form.specialties.includes("Other") && (
              <div className="mt-4">
                <Field label="Please specify your specialty or subspecialty" optional>
                  <input
                    name="specialtyOther"
                    className={inputClass}
                    placeholder="e.g. Pediatric Cardiology"
                    value={form.specialtyOther}
                    onChange={setText("specialtyOther")}
                  />
                </Field>
              </div>
            )}
          </div>

          <div className="border-t border-gray-700 pt-5">
            <p className="text-sm font-medium text-neutral-200 mb-3">What can you help mentees with?</p>
            {errors.helpWith && <p className="text-xs text-red-400 mb-2">{errors.helpWith}</p>}
            <div className="grid grid-cols-2 gap-2">
              {HELP_OPTIONS.map((opt) => (
                <CheckItem key={opt} name="helpWith" label={opt} checked={form.helpWith.includes(opt)} onChange={() => toggleArray("helpWith", opt)} />
              ))}
            </div>
          </div>

          <div className="border-t border-gray-700 pt-5">
            <p className="text-sm font-medium text-neutral-200 mb-3">How many mentees can you take on right now?</p>
            {errors.capacity && <p className="text-xs text-red-400 mb-2">{errors.capacity}</p>}
            <div className="flex flex-col gap-2">
              {CAPACITY_OPTIONS.map((opt) => (
                <RadioItem key={opt} name="capacity" label={opt} selected={form.capacity === opt} onChange={() => setRadio("capacity", opt)} />
              ))}
            </div>
          </div>

          <div className="border-t border-gray-700 pt-5">
            <p className="text-sm font-medium text-neutral-200 mb-1">Preferred contact method <span className="text-neutral-500 font-normal">(optional)</span></p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {CONTACT_OPTIONS.map((opt) => (
                <CheckItem key={opt} name="contactMethods" label={opt} checked={form.contactMethods.includes(opt)} onChange={() => toggleArray("contactMethods", opt)} />
              ))}
            </div>
          </div>

          <Field label="Scheduling link" optional hint="Calendly, Cal.com, etc.">
            <input name="schedulingLink" className={inputClass} placeholder="https://calendly.com/yourname" value={form.schedulingLink} onChange={setText("schedulingLink")} />
          </Field>
        </div>
      )}

      {/* Section 3: Final */}
      {section === 3 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold text-white mb-1">Almost done</h2>
            <p className="text-sm text-neutral-400 mb-6">Just a couple of final confirmations before your profile goes live.</p>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 space-y-1">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="consent1"
                checked={form.consent1}
                onChange={() => { setForm((f) => ({ ...f, consent1: !f.consent1 })); setErrors((e) => { const n = { ...e }; delete n.consent1; return n; }); }}
                className="mt-0.5 accent-[var(--global-theme-color)]"
              />
              <span className="text-sm text-neutral-300 leading-relaxed">
                I agree to be listed publicly on the AP MED Mentors directory. I understand my name, role, institution, bio, and selected tags will be visible to pre-med students.
              </span>
            </label>
            {errors.consent1 && <p className="text-xs text-red-400 pl-6">{errors.consent1}</p>}
          </div>

          <div className="bg-gray-800 rounded-xl p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="consent2"
                checked={form.consent2}
                onChange={() => setForm((f) => ({ ...f, consent2: !f.consent2 }))}
                className="mt-0.5 accent-[var(--global-theme-color)]"
              />
              <span className="text-sm text-neutral-300 leading-relaxed">
                I&apos;m open to being a future guest on the AP MED podcast, if I haven&apos;t been already. <span className="text-neutral-500">(optional)</span>
              </span>
            </label>
          </div>

          <Field label="Your email address" error={errors.email} hint="So Andrew can confirm when your profile is live. Not shown publicly.">
            <input name="email" className={inputClass} type="email" placeholder="you@example.com" value={form.email} onChange={setText("email")} />
          </Field>

          <Field label="Anything else you'd like Andrew to know?" optional>
            <textarea
              name="notes"
              className={`${inputClass} min-h-[80px] resize-y`}
              placeholder="Any scheduling constraints, preferred mentee types, questions, etc."
              value={form.notes}
              onChange={setText("notes")}
            />
          </Field>
        </div>
      )}

      {/* Turnstile CAPTCHA — only shown on final section */}
      {section === 3 && (
        <div className="mt-8">
          <Turnstile
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
            onSuccess={(token) => { turnstileToken.current = token; }}
            onExpire={() => { turnstileToken.current = null; }}
            options={{ theme: "dark" }}
          />
        </div>
      )}

      {/* Nav */}
      <div className="flex justify-between items-center mt-10 pt-6 border-t border-gray-700">
        {section > 0 ? (
          <button onClick={handleBack} className="text-sm text-neutral-400 hover:text-white transition-colors">
            ← Back
          </button>
        ) : <div />}
        <button
          onClick={handleNext}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
          style={{ background: themeBlue }}
        >
          {section === 3 ? "Submit →" : "Continue →"}
        </button>
      </div>
    </div>
  );
}