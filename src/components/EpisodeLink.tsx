"use client";

import { Headphones } from "lucide-react";
import { track } from "@vercel/analytics";
import { usePostHog } from "posthog-js/react";
import type { Mentor } from "@/types/mentor";

type Props = {
  mentor: Pick<Mentor, "id" | "first_name" | "last_name" | "episode_url">;
};

// Small, unobtrusive link to a mentor's podcast episode. Renders inline next to
// the mentor's name in both the directory and match-results cards. Renders
// nothing when there's no usable episode_url (NULL or the literal "EMPTY" seen
// in the data).
export default function EpisodeLink({ mentor }: Props) {
  const posthog = usePostHog();
  const hasEpisode = mentor.episode_url && mentor.episode_url !== "EMPTY";
  if (!hasEpisode) return null;

  const fullName = `${mentor.first_name} ${mentor.last_name}`;

  return (
    <a
      href={mentor.episode_url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Listen to ${mentor.first_name}'s podcast episode`}
      title="Listen to episode"
      onClick={(e) => {
        // Don't trigger any card-level click handlers.
        e.stopPropagation();
        track("episode_click", { name: fullName });
        posthog?.capture("mentor_episode_clicked", {
          mentor_id: mentor.id,
          mentor_name: fullName,
        });
      }}
      className="inline-flex items-center justify-center w-7 h-7 ml-2 align-middle rounded-full text-neutral-500 hover:text-neutral-100 hover:bg-neutral-700/60 transition-colors flex-shrink-0"
    >
      <Headphones size={14} />
    </a>
  );
}
