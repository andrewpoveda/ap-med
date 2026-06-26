import type { Metadata } from "next";
import MentorsDirectory from "./MentorsDirectory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find a Pre-Med Mentor | AP MED Mentors",
  description:
    "Browse and connect with podcast-vetted physicians and medical students who share your background. Free identity-matched mentorship for pre-med students.",
};

export default function MentorsPage() {
  return <MentorsDirectory />;
}
