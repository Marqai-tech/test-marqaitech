import type { PrismaClient } from '@/generated/prisma/client';
import { sendEmail } from '@/lib/email';
import { buildBrandedEmailForTenant } from '@/lib/tenant-branding';

/**
 * Task 109 — Suspicious punch detection + admin alerting.
 *
 * When a punch carries forged / implausible signatures, or lands on a
 * holiday / weekend, admins and HR are alerted BOTH in-app (notification
 * center) and by email so they can immediately audit the record.
 *
 * Flags raised here:
 *   EXACT_GEOFENCE_PIN  — mobile/web check-in coordinates are < 0.5 m from
 *                         the geofence center. Real device GPS virtually
 *                         never lands exactly on the configured pin
 *                         (mock/declared location signature).
 *   SHARED_COORDINATES  — the same rounded coordinates (6 dp ≈ 11 cm) were
 *                         already used by a DIFFERENT employee's punch on
 *                         the same date (one device punching for many).
 *   HOLIDAY_WEEKEND_PUNCH — the punch was recorded on a company holiday or
 *                         a weekend (informational: admins should confirm
 *                         the work was authorized).
 *
 * Alerting is best-effort and NON-FATAL: a notification/email failure never
 * blocks the punch itself. Alerts are de-duplicated per (employee, date,
 * flag) so one bad punch cannot spam the inbox.
 */

export interface SuspiciousFlag {
  flag: string;
  detail: string;
  severity: 'high' | 'medium' | 'info';
}

interface PunchSuspicionInput {
  db: PrismaClient | any;
  tenantId: string | null;
  employee: {
    id: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    email: string;
    userId?: string | null;
  };
  dateStr: string;          // YYYY-MM-DD (employee local calendar date)
  action: string;           // checkin | checkout | breakin | breakout | biometric…
  method: string;           // mobile | web | biometric
  gpsLat: number | null;
  gpsLng: number | null;
  holidayName?: string | null; // set when the date is a company holiday
  isWeekend?: boolean;
}

/** Haversine distance in meters (same math as the punch geofence check). */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function round6(v: number): string {
  return v.toFixed(6);
}

/** Evaluate the punch against the suspicious-signature checks. */
async function evaluate(input: PunchSuspicionInput): Promise<SuspiciousFlag[]> {
  const { db, employee, dateStr, action, method, gpsLat, gpsLng } = input;
  const flags: SuspiciousFlag[] = [];

  // ── 1. Exact geofence pin (mock signature) ──────────────────────────────
  if ((gpsLat != null && gpsLng != null) && (method === 'mobile' || method === 'web') && action === 'checkin') {
    try {
      const fences = await db.geofence.findMany({
        where: { isActive: true },
        select: { name: true, centerLat: true, centerLng: true },
      });
      for (const f of fences) {
        const d = haversineMeters(gpsLat, gpsLng, Number(f.centerLat), Number(f.centerLng));
        if (d < 0.5) {
          flags.push({
            flag: 'EXACT_GEOFENCE_PIN',
            detail: `Check-in coordinates match the "${f.name}" geofence center exactly (${d.toFixed(2)} m) — possible mock or manually declared location.`,
            severity: 'high',
          });
          break;
        }
      }
    } catch { /* geofence table missing — skip */ }
  }

  // ── 2. Shared coordinates with another employee on the same date ───────
  if (gpsLat != null && gpsLng != null && (action === 'checkin' || action === 'checkout')) {
    try {
      const lat = Number(gpsLat);
      const lng = Number(gpsLng);
      // 6 dp ≈ 11 cm — beyond coincidence for independent devices.
      const rows = await db.$queryRawUnsafe(
        `SELECT pe."employeeId", e."firstName", e."lastName", e."employeeId" AS "code", pe."type", pe."method"
           FROM "PunchEvent" pe
           JOIN "Employee" e ON e."id" = pe."employeeId"
          WHERE pe."employeeId" <> $1
            AND pe."date" = $2
            AND pe."type" IN ('checkin','checkout')
            AND pe."gpsLat" IS NOT NULL AND pe."gpsLng" IS NOT NULL
            AND ROUND(pe."gpsLat"::numeric, 6) = $3::numeric
            AND ROUND(pe."gpsLng"::numeric, 6) = $4::numeric
          LIMIT 3`,
        employee.id,
        new Date(`${dateStr}T00:00:00`),
        round6(lat),
        round6(lng),
      ) as Array<{ employeeId: string; firstName: string; lastName: string; code: string; type: string; method: string }>;
      if (rows.length > 0) {
        const other = rows[0];
        flags.push({
          flag: 'SHARED_COORDINATES',
          detail: `Coordinates identical to ${other.firstName} ${other.lastName} (${other.code})'s ${other.type} punch on ${dateStr} — same device/location used for multiple employees.`,
          severity: 'high',
        });
      }
    } catch { /* raw query unsupported — skip */ }
  }

  // ── 3. Holiday / weekend punch (all methods, incl. biometric) ──────────
  if (input.holidayName || input.isWeekend) {
    flags.push({
      flag: 'HOLIDAY_WEEKEND_PUNCH',
      detail: input.holidayName
        ? `Punch recorded on the holiday "${input.holidayName}" (${dateStr}).`
        : `Punch recorded on a weekend (${dateStr}).`,
      severity: 'info',
    });
  }

  return flags;
}

/**
 * Run the checks + fan out alerts. Call AFTER the punch is persisted.
 * Never throws — alerting must not break the punch flow.
 */
export async function detectAndAlertSuspiciousPunch(input: PunchSuspicionInput): Promise<SuspiciousFlag[]> {
  try {
    const { db, tenantId, employee, dateStr, action, method } = input;
    const flags = await evaluate(input);
    if (flags.length === 0) return [];

    const empName = `${employee.firstName} ${employee.lastName}`.trim();
    const empCode = employee.employeeId || employee.id;
    const dedupeToken = `#AUD#${employee.id}#${dateStr}`;

    for (const f of flags) {
      // De-duplicate: one alert per (employee, date, flag).
      const existing = await db.notification.findFirst({
        where: {
          category: 'attendance',
          title: 'Suspicious punch detected',
          message: { contains: dedupeToken },
        },
        select: { id: true },
      }).catch(() => null);
      if (existing) continue;

      const message = `${f.detail}${dedupeToken}`;
      const title = f.severity === 'info' ? 'Punch on holiday / weekend' : 'Suspicious punch detected';

      // 1. In-app notifications → admins + HR (and the employee's own bell)
      try {
        const admins = await db.user.findMany({
          where: {
            tenantId: tenantId || undefined,
            role: { in: ['tenant_admin', 'ceo', 'admin', 'hr_admin', 'hr'] },
          },
          select: { id: true, email: true },
        });
        const recipients = Array.from(new Set([
          ...admins.map((u: { id: string }) => u.id),
          employee.userId || '',
        ].filter(Boolean)));
        if (recipients.length) {
          await db.notification.createMany({
            data: recipients.map((userId: string) => ({
              tenantId,
              userId,
              title,
              message,
              type: f.severity === 'info' ? 'info' : 'warning',
              category: 'attendance',
              link: '/attendance/punch-log',
            })),
          });
        }

        // 2. Email → admins + HR
        const emails = Array.from(new Set(admins
          .map((u: { email?: string | null }) => u.email)
          .filter((e): e is string => Boolean(e))));
        if (emails.length) {
          // REQ 5 — wrap the alert body in the tenant-branded template.
          const innerHtml = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto">
  <h2 style="color:${f.severity === 'high' ? '#dc2626' : '#2563eb'};margin:0 0 12px">${title}</h2>
  <p style="color:#334155;font-size:14px;line-height:1.6">
    <strong>${empName}</strong> (${empCode}) — <strong>${action}</strong> via <strong>${method}</strong> on <strong>${dateStr}</strong>.
  </p>
  <p style="color:#334155;font-size:14px;line-height:1.6">${f.detail}</p>
  <p style="color:#64748b;font-size:13px">Review the punch in Attendance → Punch Activity Log. Flag: <code>${f.flag}</code></p>
  <p style="color:#94a3b8;font-size:11px;margin-top:24px">Automated attendance integrity alert from 3Boxes HRMS.</p>
</div>`;
          try {
            const html = await buildBrandedEmailForTenant(tenantId, { title, bodyHtml: innerHtml });
            await sendEmail({
              to: emails,
              subject: `${title}: ${empName} (${empCode}) — ${dateStr}`,
              html,
            });
          } catch {
            // Fallback: send unbranded so the alert still goes out.
            await sendEmail({
              to: emails,
              subject: `${title}: ${empName} (${empCode}) — ${dateStr}`,
              html: innerHtml,
            });
          }
        }
      } catch (alertErr) {
        console.warn('[suspicious-punch] alerting failed (non-fatal):', alertErr);
      }
    }
    return flags;
  } catch (err) {
    console.warn('[suspicious-punch] evaluation failed (non-fatal):', err);
    return [];
  }
}
