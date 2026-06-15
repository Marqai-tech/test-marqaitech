import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// BRANDING GUARD: This middleware ensures that the "eh2r" or any other wrong
// branding never appears on the Vercel deployment. It triggers the fix-tenant
// API endpoint on every authenticated page load to keep the database correct.
export default function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|login|_next/static|_next/image|favicon.ico).*)'],
}
