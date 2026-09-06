"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { usePathname } from "next/navigation";
import { useEffect, Suspense, useState } from "react";
import { sanitizeAnalyticsUrl, sanitizePostHogEvent } from "@/lib/analytics-privacy";

function PageviewTracker() {
  const pathname = usePathname();
  const ph = usePostHog();

  useEffect(() => {
    if (pathname) {
      // Deliberately never read query/hash data into the analytics payload.
      const url = sanitizeAnalyticsUrl(window.origin + pathname);
      ph.capture("$pageview", { $current_url: url });
    }
  }, [pathname, ph]);

  return null;
}

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
        person_profiles: "identified_only",
        // Explicit events and sanitized pageviews provide useful product
        // analytics without scraping rendered names, emails, or cohort data.
        autocapture: false,
        capture_dead_clicks: false,
        capture_exceptions: false,
        capture_heatmaps: false,
        capture_pageview: false,
        mask_all_element_attributes: true,
        mask_all_text: true,
        // Authenticated and program pages render sensitive personal data. Keep
        // replay disabled globally rather than relying on route timing, and
        // retain full masking as defense in depth if this policy changes later.
        disable_session_recording: true,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: "*",
        },
        before_send: sanitizePostHogEvent,
        get_current_url: sanitizeAnalyticsUrl,
      });
      setIsInitialized(true);
    }
  }, []);

  return (
    <PHProvider client={posthog}>
      {isInitialized ? (
        <Suspense fallback={null}>
          <PageviewTracker />
        </Suspense>
      ) : null}
      {children}
    </PHProvider>
  );
}
