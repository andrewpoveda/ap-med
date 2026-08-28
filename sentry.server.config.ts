import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ??
    "https://b9721dc9b0c9a5bc7021e25653895aaa@o4511567389786112.ingest.us.sentry.io/4511567390965760",
  sendDefaultPii: false,
  tracesSampleRate: 0.2,
});
