"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { cn } from "@/components/institutions/cn";
import { isValidEmail } from "@/lib/validate";

const CONTACT = "apmedpodcast@gmail.com";

type Fields = {
  name: string;
  email: string;
  organization: string;
  role: string;
  program: string;
};

type FieldErrors = Partial<Record<keyof Fields, string>>;

const fields: {
  name: keyof Fields;
  label: string;
  type?: string;
  textarea?: boolean;
  placeholder: string;
  span?: boolean;
  autoComplete?: string;
}[] = [
  { name: "name", label: "Name", placeholder: "Jordan Lee", autoComplete: "name" },
  { name: "email", label: "Work email", type: "email", placeholder: "you@institution.edu", autoComplete: "email" },
  { name: "organization", label: "Organization", placeholder: "College of Medicine", autoComplete: "organization" },
  { name: "role", label: "Role", placeholder: "Program director", autoComplete: "organization-title" },
  {
    name: "program",
    label: "What program do you operate?",
    textarea: true,
    placeholder: "A closed pre-health cohort, currently on forms and a spreadsheet.",
    span: true,
    autoComplete: "off",
  },
];

function validate(values: Fields): FieldErrors {
  const errors: FieldErrors = {};
  if (values.name.trim().length < 2) errors.name = "Enter your name.";
  if (!isValidEmail(values.email.trim())) errors.email = "Enter a valid email.";
  if (values.organization.trim().length < 2) errors.organization = "Enter your organization.";
  if (values.role.trim().length < 2) errors.role = "Enter your role.";
  if (values.program.trim().length < 2) errors.program = "Describe the program in a sentence.";
  return errors;
}

export function ContactForm() {
  const [values, setValues] = useState<Fields>({
    name: "",
    email: "",
    organization: "",
    role: "",
    program: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [sent, setSent] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validate(values);
    if (Object.keys(next).length > 0) {
      setErrors(next);
      const first = fields.find((field) => next[field.name]);
      if (first) {
        requestAnimationFrame(() => document.getElementById(`contact-${first.name}`)?.focus());
      }
      return;
    }

    const body = [
      `Name: ${values.name.trim()}`,
      `Email: ${values.email.trim()}`,
      `Organization: ${values.organization.trim()}`,
      `Role: ${values.role.trim()}`,
      `Program: ${values.program.trim()}`,
    ].join("\n");
    const href = `mailto:${CONTACT}?subject=${encodeURIComponent(
      `AP MED inquiry — ${values.organization.trim()}`,
    )}&body=${encodeURIComponent(body)}`;

    window.location.href = href;
    setSent(true);
    setErrors({});
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-line bg-paper px-6 py-8" role="status" aria-live="polite">
        <p className="font-display text-2xl">Open the message in your email client.</p>
        <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-muted">
          If nothing opened, write directly to{" "}
          <a className="text-gold-dark underline decoration-line underline-offset-4" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          . That address reaches the AP MED team.
        </p>
        <button
          type="button"
          className="mt-6 min-h-11 text-[14px] font-medium text-gold-dark underline decoration-line underline-offset-4"
          onClick={() => setSent(false)}
        >
          Edit the note
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const id = `contact-${field.name}`;
          const error = errors[field.name];
          const shared = {
            id,
            name: field.name,
            value: values[field.name],
            onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              setValues((v) => ({ ...v, [field.name]: e.target.value }));
              if (error) setErrors((er) => ({ ...er, [field.name]: undefined }));
            },
            placeholder: field.placeholder,
            "aria-invalid": Boolean(error),
            "aria-describedby": error ? `${id}-error` : undefined,
            "aria-required": true,
            autoComplete: field.autoComplete ?? "on",
            required: true,
            className: cn(
              "mt-1.5 w-full rounded-lg border bg-paper px-3 py-2.5 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-150",
              "placeholder:text-faint focus:border-gold/50 focus:shadow-[0_0_0_3px_var(--color-gold-soft)]",
              error ? "border-danger" : "border-line",
            ),
          };
          return (
            <label
              key={field.name}
              className={cn(
                "block text-[13px] font-medium text-ink",
                field.textarea || field.span ? "sm:col-span-2" : "",
              )}
              htmlFor={id}
            >
              {field.label}
              {field.textarea ? (
                <textarea {...shared} rows={4} />
              ) : (
                <input {...shared} type={field.type ?? "text"} />
              )}
              {error ? (
                <span id={`${id}-error`} className="mt-1 block text-[12px] font-normal text-danger" role="alert">
                  {error}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-4 pt-2">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-lg bg-gold px-5 text-[14px] font-semibold text-gold-fg transition-transform duration-150 ease-out active:scale-[0.96]"
        >
          Ask if this can run your year
        </button>
        <p className="text-[13px] text-muted">
          Opens a message to the AP MED team. No account, no ticket system.
        </p>
      </div>
    </form>
  );
}
