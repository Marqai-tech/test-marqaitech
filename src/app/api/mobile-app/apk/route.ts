import { NextResponse } from 'next/server';

/**
 * APK Download API
 *
 * Serves the 3Boxes HRMS Android APK (Flutter, built from hrms_app/).
 * The binary is committed at public/downloads/3boxes-hrms-mobile.apk so every
 * Vercel deployment serves it directly. This route redirects to it with a
 * relative URL so it works on ANY host (live, demo, or preview).
 */
export async function GET() {
  return NextResponse.redirect('/downloads/3boxes-hrms-mobile.apk');
}
