// Task 110 — public app-release info for the mobile app's in-app updater.
// No auth: the updater calls this BEFORE login (from the sign-in screen) so
// a user stuck on an old build can always discover + download the latest APK
// from their own workspace link.
import { NextResponse } from 'next/server';
import { APP_RELEASE } from '@/lib/app-version';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const origin = `${request.headers.get('x-forwarded-proto') || 'https'}://${
    request.headers.get('x-forwarded-host') || request.headers.get('host') || '3boxeshrms.com'
  }`;
  return NextResponse.json(
    {
      ...APP_RELEASE,
      apkUrl: `${origin}${APP_RELEASE.apkUrl}`,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
