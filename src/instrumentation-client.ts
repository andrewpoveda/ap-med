import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://b9721dc9b0c9a5bc7021e25653895aaa@o4511567389786112.ingest.us.sentry.io/4511567390965760",
  sendDefaultPii: false,
  tracesSampleRate: 0.2,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
