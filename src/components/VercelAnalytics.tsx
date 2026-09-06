"use client";

import {
  Analytics,
  type BeforeSendEvent,
} from "@vercel/analytics/next";
import { sanitizeAnalyticsUrl } from "@/lib/analytics-privacy";

function sanitizeVercelEvent(event: BeforeSendEvent): BeforeSendEvent {
  return {
    ...event,
    url: sanitizeAnalyticsUrl(event.url),
  };
}

export default function VercelAnalytics() {
  return <Analytics beforeSend={sanitizeVercelEvent} />;
}
