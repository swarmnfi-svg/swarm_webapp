/**
 * NOVA Chat FCM push scaffold (Phase 2C).
 *
 * Blocked without Firebase project credentials (`google-services.json` +
 * server FCM key / service account). This module is a no-op until wired.
 *
 * To enable later:
 * 1. Add `fcmToken` column on `ClientDeviceRegistration` (migration).
 * 2. Accept `fcmToken` on `POST /api/client/v1/devices/register`.
 * 3. Call `sendNovaPush` from task/approval/update event hooks.
 * 4. Android: add Firebase BOM + `google-services.json` per flavor.
 */

export type NovaPushPayload = {
  userId: string;
  title: string;
  body: string;
  /** Deep link path or absolute URL opened by the app (e.g. /nova thread). */
  href?: string;
  threadId?: string;
};

export type NovaPushResult =
  | { ok: true; skipped: true; reason: "fcm_not_configured" }
  | { ok: false; error: string };

/** Returns skipped until Firebase server credentials are configured. */
export async function sendNovaPush(
  _payload: NovaPushPayload
): Promise<NovaPushResult> {
  return {
    ok: true,
    skipped: true,
    reason: "fcm_not_configured",
  };
}

export function isNovaPushConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_SERVER_KEY?.trim() ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
  );
}
