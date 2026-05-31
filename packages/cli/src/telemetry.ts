import { PostHog } from 'posthog-node';
import { loadConfig } from './config.js';

// Dummy key for local development until we switch to production
const POSTHOG_API_KEY = 'phc_dummy_key';
const POSTHOG_HOST = 'https://app.posthog.com';

let client: PostHog | null = null;
let telemetryEnabled = true;

export async function initTelemetry() {
  const config = await loadConfig();
  if (config.disableTelemetry) {
    telemetryEnabled = false;
    return;
  }

  try {
    client = new PostHog(POSTHOG_API_KEY, { host: POSTHOG_HOST });
  } catch (e) {
    telemetryEnabled = false;
  }
}

export function trackEvent(eventName: string, properties?: Record<string, any>) {
  if (!telemetryEnabled || !client) return;

  client.capture({
    distinctId: 'anonymous_user_' + process.platform,
    event: eventName,
    properties,
  });
}

export async function shutdownTelemetry() {
  if (client) {
    try {
      await client.shutdown();
    } catch (e) {
      // Ignore network errors
    }
  }
}

export async function flushTelemetry() {
  if (client) {
    try {
      await client.flush();
    } catch (e) {
      // Ignore network errors during flush
    }
  }
}
