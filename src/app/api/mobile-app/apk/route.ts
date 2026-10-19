import { NextResponse } from 'next/server';

/**
 * APK Download API
 *
 * Serves the 3Boxes HRMS Android APK (Flutter, built from hrms_app/).
 * The binary is committed at public/downloads/ so every Vercel deployment
 * serves it directly. This route redirects to the LATEST APK with an
 * ABSOLUTE, host-aware URL (NextResponse.redirect rejects relative URLs —
 * the previous relative redirect 500-ed on every host).
 *
 * The unversioned file is kept as an "always latest" alias for the small
 * number of v1.0.8 builds that hardcode /downloads/3boxes-hrms-mobile.apk.
 * New releases use a versioned filename and are referenced from
 * src/lib/app-version.ts + the web login page.
 */
export async function GET(request: Request) {
  const origin = `${request.headers.get('x-forwarded-proto') || 'https'}://${
    request.headers.get('x-forwarded-host') || request.headers.get('host') || '3boxeshrms.com'
  }`;
  return NextResponse.redirect(`${origin}/downloads/3boxes-hrms-mobile.apk`, 307);
}
