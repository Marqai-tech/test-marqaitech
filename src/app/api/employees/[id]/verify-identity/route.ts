import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { canEditEmployeeRecords } from '@/lib/roleAccess';
import { parseAadhaarPayload, compareAadhaarWithEmployee } from '@/lib/aadhaar-qr';
import { validatePAN } from '@/lib/validators';
import { getDigiLockerStatus } from '@/lib/digilocker';
import { resolveTenantId } from '@/lib/chat-permissions';

/**
 * Task 138 — identity verification for the employee module.
 *
 * POST /api/employees/[id]/verify-identity   (HR / Admin only)
 * Body:
 *   { method: 'aadhaar-qr' | 'offline-xml' | 'pan', payload?: string,
 *     apply?: boolean, note?: string }
 *
 *  - 'aadhaar-qr'  — the numeric QR contents (admin uploads/scans the QR image;
 *    the browser decodes it with jsQR and posts the payload here).
 *  - 'offline-xml' — the DigiLocker "Offline Aadhaar" paperless e-KYC XML.
 *  - 'pan'         — payload = the PAN; format-validated and recorded.
 *
 * The server parses the payload, automatically compares the extracted
 * Name / DOB / Gender / Address with the employee's record and stores the
 * verdict on Employee.kycVerification (+ kycVerifiedAt). With apply=true the
 * admin can also copy the extracted details onto the employee record.
 * Aadhaar numbers themselves are NEVER persisted — only the last 4 digits as
 * a masked reference.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    if (!canEditEmployeeRecords(typeof decoded.role === 'string' ? decoded.role : String((decoded as { role?: unknown }).role || ''))) {
      return NextResponse.json({ error: 'Only HR / Admin can run identity verification' }, { status: 403 });
    }

    const { id } = await params;
    const employee = await db.employee.findUnique({
      where: { id },
      select: {
        id: true, firstName: true, lastName: true, employeeId: true, email: true,
        dateOfBirth: true, gender: true, address: true, city: true, state: true, zipCode: true,
        panNumber: true, aadhaarNumber: true,
      },
    });
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const method = String(body?.method || '');
    const payload = String(body?.payload || '').trim();
    const apply = Boolean(body?.apply);
    const note = body?.note ? String(body.note).slice(0, 300) : null;

    if (method === 'digilocker') {
      const status = getDigiLockerStatus();
      if (!status.configured) {
        return NextResponse.json({
          error: `DigiLocker is not configured on this deployment yet (missing: ${status.missing.join(', ')})`,
          digilocker: status,
        }, { status: 501 });
      }
      return NextResponse.json({ ok: false, error: 'Start the flow from the DigiLocker authorize endpoint', digilocker: status }, { status: 400 });
    }

    if (method === 'pan') {
      if (!payload) return NextResponse.json({ error: 'PAN is required' }, { status: 400 });
      const pan = validatePAN(payload);
      if (!pan.valid) return NextResponse.json({ error: pan.error || 'Invalid PAN' }, { status: 400 });
      const panNo = pan.normalized || payload.toUpperCase().replace(/\s+/g, '');
      const matchesPanOnRecord = employee.panNumber ? employee.panNumber.toUpperCase() === panNo : null;
      const result = {
        method: 'pan',
        status: 'verified',
        summary: `PAN format valid (${panNo.slice(0, 2)}••••${panNo.slice(-1)})${matchesPanOnRecord === null ? ' — no PAN stored on the record yet' : matchesPanOnRecord ? ' — matches the PAN on record' : ' — DIFFERENT from the PAN on record'}`,
        extracted: { name: null, dob: null, gender: null, address: null, aadhaarLast4: null },
        matches: { name: null, dob: null, gender: null, address: null },
        reference: panNo,
        verifiedById: String(decoded.userId || ''),
        verifiedByName: String(decoded.email || decoded.userId || ''),
        note,
      };
      await db.employee.update({
        where: { id },
        data: { kycVerification: JSON.stringify(result), kycVerifiedAt: new Date(), ...(matchesPanOnRecord === null ? { panNumber: panNo } : {}) },
      });
      return NextResponse.json({ ok: true, verification: result, applied: matchesPanOnRecord === null ? ['panNumber'] : [] });
    }

    if (method !== 'aadhaar-qr' && method !== 'offline-xml') {
      return NextResponse.json({ error: "method must be 'aadhaar-qr', 'offline-xml' or 'pan'" }, { status: 400 });
    }

    if (!payload) return NextResponse.json({ error: 'The Aadhaar QR payload or offline XML is required' }, { status: 400 });
    const parsed = parseAadhaarPayload(payload);
    if (!parsed.parseable) {
      return NextResponse.json({
        error: parsed.hint || 'Could not read identity details from the payload',
        format: parsed.format,
      }, { status: 422 });
    }

    const comparison = compareAadhaarWithEmployee(parsed.extracted, employee);
    const result = {
      method: parsed.format === 'offline-xml' ? 'offline-xml' : 'aadhaar-qr',
      status: comparison.status,
      summary: comparison.summary,
      extracted: {
        name: parsed.extracted.name || null,
        dob: parsed.extracted.dob || null,
        gender: parsed.extracted.gender || null,
        address: parsed.extracted.address || null,
        aadhaarLast4: parsed.extracted.aadhaarLast4 || null,
      },
      matches: comparison.matches,
      reference: parsed.extracted.aadhaarLast4 ? `XXXX${parsed.extracted.aadhaarLast4}` : null,
      verifiedById: String(decoded.userId || ''),
      verifiedByName: String(decoded.email || decoded.userId || ''),
      note,
    };

    // Optional one-click copy of the extracted details onto the record
    // (admin-checked before apply is sent).
    const applied: string[] = [];
    if (apply) {
      const data: Record<string, unknown> = {};
      if (parsed.extracted.name) {
        const words = parsed.extracted.name.trim().split(/\s+/);
        if (words.length && !result.matches.name) {
          data.firstName = words[0];
          data.lastName = words.slice(1).join(' ') || data.firstName || employee.lastName;
          applied.push('firstName', 'lastName');
        }
      }
      if (parsed.extracted.dob && result.matches.dob === false) {
        data.dateOfBirth = new Date(parsed.extracted.dob);
        applied.push('dateOfBirth');
      }
      if (parsed.extracted.gender && result.matches.gender === false) {
        data.gender = parsed.extracted.gender;
        applied.push('gender');
      }
      if (parsed.extracted.address && result.matches.address === false) {
        data.address = parsed.extracted.address;
        applied.push('address');
      }
      if (Object.keys(data).length) {
        await db.employee.update({ where: { id }, data });
      }
    }

    await db.employee.update({
      where: { id },
      data: { kycVerification: JSON.stringify(result), kycVerifiedAt: new Date() },
    });

    return NextResponse.json({ ok: true, verification: result, applied, format: parsed.format });
  } catch (error) {
    console.error('verify-identity error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** GET — current verification state + DigiLocker configuration status. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(request);
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { id } = await params;
    const employee = await db.employee.findUnique({
      where: { id },
      select: { id: true, kycVerification: true, kycVerifiedAt: true, panNumber: true, aadhaarNumber: true },
    });
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    let verification: unknown = null;
    if (employee.kycVerification) {
      try { verification = JSON.parse(employee.kycVerification); } catch { verification = null; }
    }
    const tenantId = await resolveTenantId(request, platformDb as unknown as Parameters<typeof resolveTenantId>[1], decoded as { tenantId?: string | null }).catch(() => null);
    void tenantId;
    return NextResponse.json({
      verification,
      verifiedAt: employee.kycVerifiedAt,
      panOnRecord: employee.panNumber || null,
      aadhaarOnRecord: employee.aadhaarNumber ? `XXXX${employee.aadhaarNumber.slice(-4)}` : null,
      digilocker: getDigiLockerStatus(),
    });
  } catch (error) {
    console.error('verify-identity GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
