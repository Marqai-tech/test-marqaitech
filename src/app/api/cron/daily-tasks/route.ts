/**
 * Unified Daily Tasks Cron (Hobby-plan safe)
 *
 *   GET /api/cron/daily-tasks        (Authorization: Bearer <CRON_SECRET>)
 *   GET /api/cron/daily-tasks?secret=<CRON_SECRET>
 *   GET /api/cron/daily-tasks        (admin JWT — runs caller's tenant only)
 *
 * Vercel Hobby plan allows only 2 cron jobs. This route consolidates the 3
 * previously-registered daily crons into a single Vercel Cron entry:
 *
 *   1. /api/cron/policy-ack-reminders   (was 30 3 * * *)
 *   2. /api/cron/leave-reminders         (was 0 9 * * *)
 *   3. /api/cron/interview-reminders    (was 0 9 * * *)
 *
 * The new schedule (vercel.json): "0 9 * * *" — daily 09:00 UTC.
 *
 * Each underlying task retains its own auth + idempotency logic — this
 * route simply forwards the incoming Authorization header so the original
 * CRON_SECRET check still passes. If any one task throws, the others still
 * run; the per-task status is reported back in the JSON response.
 *
 * Manual trigger from the browser:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://test-marqaitech-ontt.vercel.app/api/cron/daily-tasks
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — generous budget for 3 sequential sweeps

const BUILD_STAMP = 'unified-daily-cron-2026-11-13';

const TASKS: ReadonlyArray<{ name: string; path: string }> = [
  { name: 'policy-ack-reminders', path: '/api/cron/policy-ack-reminders' },
  { name: 'leave-reminders', path: '/api/cron/leave-reminders' },
  { name: 'interview-reminders', path: '/api/cron/interview-reminders' },
  // BRD Figure 1.2 — onboarding task reminders + Day 7/30/60/90 milestone
  // template self-heal (previously never scheduled).
  { name: 'onboarding-reminders', path: '/api/cron/onboarding-reminders' },
];

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: cors() });
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  // ---- Auth -------------------------------------------------------------
  // Vercel Cron injects Authorization: Bearer $CRON_SECRET automatically.
  // We forward the same header to each underlying task so its own auth
  // check still passes.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const isCronSecret =
    (cronSecret && token === cronSecret) ||
    (request.nextUrl.searchParams.get('secret') === cronSecret && cronSecret);

  // Admin-JWT manual trigger: forward the JWT so each task's own admin
  // check (single-tenant sweep) kicks in. We don't validate the JWT here —
  // the underlying routes do.
  const isAdminJwt = !isCronSecret && !!token && !cronSecret;

  if (!isCronSecret && !isAdminJwt) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
  }

  // ---- Build internal base URL -----------------------------------------
  // Use the same host so the call stays inside this deployment.
  const incomingUrl = new URL(request.url);
  const baseUrl = `${incomingUrl.protocol}//${incomingUrl.host}`;

  // ---- Run each task sequentially --------------------------------------
  const results: Array<{
    name: string;
    path: string;
    ok: boolean;
    status: number | string;
    durationMs: number;
    data?: unknown;
    error?: string;
  }> = [];

  let totalSuccess = 0;
  let totalErrors = 0;

  for (const task of TASKS) {
    const taskStart = Date.now();
    try {
      const taskUrl = `${baseUrl}${task.path}`;
      const res = await fetch(taskUrl, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          'x-cron-internal': 'daily-tasks',
          'user-agent': '3boxes-hrms-unified-cron/1.0',
        },
        redirect: 'manual',
        // Vercel serverless fetch — keepalive helps avoid hung sockets
        // when the underlying route does many DB round trips.
        keepalive: true,
      });

      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text.slice(0, 1000) };
      }

      const ok = res.status >= 200 && res.status < 300;
      if (ok) totalSuccess++;
      else totalErrors++;

      results.push({
        name: task.name,
        path: task.path,
        ok,
        status: res.status,
        durationMs: Date.now() - taskStart,
        data,
      });
    } catch (e) {
      totalErrors++;
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        name: task.name,
        path: task.path,
        ok: false,
        status: 'exception',
        durationMs: Date.now() - taskStart,
        error: msg,
      });
    }
  }

  return NextResponse.json(
    {
      success: totalErrors === 0,
      buildStamp: BUILD_STAMP,
      tasksRun: TASKS.length,
      totalSuccess,
      totalErrors,
      durationMs: Date.now() - startedAt,
      results,
      ranAt: new Date().toISOString(),
    },
    { headers: cors() },
  );
}

export async function POST(request: NextRequest) {
  return GET(request);
}
