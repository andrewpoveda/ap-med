"use client";

import { Headphones } from "lucide-react";
import { track } from "@vercel/analytics";
import { usePostHog } from "posthog-js/react";
import type { Mentor } from "@/types/mentor";
import { safeUrl } from "@/lib/url";

type Props = {
  mentor: Pick<Mentor, "id" | "first_name" | "last_name" | "episode_url">;
};

// Small, unobtrusive link to a mentor's podcast episode. Renders inline next to
// the mentor's name in both the directory and match-results cards. Renders
// nothing when there's no usable episode_url (NULL or the literal "EMPTY" seen
// in the data).
export default function EpisodeLink({ mentor }: Props) {
  const posthog = usePostHog();
  // Defense-in-depth for legacy rows: only render an http(s) target. A stored
  // javascript:/data: episode_url collapses to '#' via safeUrl and is dropped
  // here, so it can never become a clickable script href.
  const href = safeUrl(mentor.episode_url);
  const hasEpisode = mentor.episode_url && mentor.episode_url !== "EMPTY" && href !== "#";
  if (!hasEpisode) return null;

  const fullName = `${mentor.first_name} ${mentor.last_name}`;

  return (
    <a
      href={href}
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
      className="inline-flex items-center justify-center w-7 h-7 ml-2 align-middle rounded-full text-[#9a948a] hover:text-[#1a1a2e] hover:bg-[#f0ece4] transition-colors flex-shrink-0"
    >
      <Headphones size={14} />
    </a>
  );
}
