// Task 110 — public app-release info for the mobile app's in-app updater.
// No auth: the updater calls this BEFORE login (from the sign-in screen) so
// a user stuck on an old build can always discover + download the latest APK
// from their own workspace link.
//
// Task 156 — the platform ships TWO Android editions (same applicationId +
// signing key + versionCode, so they install over each other):
//   • native — full Flutter app incl. the PhonePe-style violet AI dock
//     (top-level fields keep back-compat with the native updater)
//   • shell  — Lite WebView app rendering the live web workspace
// Every apkUrl is rewritten host-aware so downloads always hit the tenant's
// own workspace.
import { NextResponse } from 'next/server';
import { APP_RELEASE, NATIVE_APP_RELEASE, SHELL_APP_RELEASE } from '@/lib/app-version';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const origin = `${request.headers.get('x-forwarded-proto') || 'https'}://${
    request.headers.get('x-forwarded-host') || request.headers.get('host') || '3boxeshrms.com'
  }`;
  return NextResponse.json(
    {
      ...APP_RELEASE,
      apkUrl: `${origin}${NATIVE_APP_RELEASE.apkUrl}`,
      native: { ...NATIVE_APP_RELEASE, apkUrl: `${origin}${NATIVE_APP_RELEASE.apkUrl}` },
      shell: { ...SHELL_APP_RELEASE, apkUrl: `${origin}${SHELL_APP_RELEASE.apkUrl}` },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
