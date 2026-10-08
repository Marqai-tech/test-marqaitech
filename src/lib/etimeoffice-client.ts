function getConfig() {
  const corporateId = process.env.ETIMEOFFICE_CORPORATE_ID?.trim();
  const username = process.env.ETIMEOFFICE_USERNAME?.trim();
  const password = process.env.ETIMEOFFICE_PASSWORD;
  if (!corporateId || !username || !password) {
    throw new Error('Team Office API is not configured. Set ETIMEOFFICE_CORPORATE_ID, ETIMEOFFICE_USERNAME, and ETIMEOFFICE_PASSWORD.');
  }
  const baseUrl = (process.env.ETIMEOFFICE_BASE_URL || 'https://api.etimeoffice.com/api').replace(/\/$/, '');
  const raw = `${corporateId}:${username}:${password}:true`;
  return {
    baseUrl,
    authorization: `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`,
  };
}

export type ETimeOfficePunch = {
  Name?: string;
  Empcode: string;
  PunchDate: string;
  M_Flag?: string | null;
  ID: number;
  Table?: string;
  EmpcardNo?: string;
};

export async function downloadLatestPunches(lastRecord: string) {
  if (!/^(0[1-9]|1[0-2])\d{4}\$\d+$/.test(lastRecord)) {
    throw new Error('Invalid Team Office LastRecord: expected MMyyyy$ID. Escape the dollar sign as \\$ in Next.js .env files (for example, 102026\\$383). No checkpoint was advanced.');
  }
  const { baseUrl, authorization } = getConfig();
  const employeeCode = process.env.ETIMEOFFICE_EMP_CODE?.trim() || 'ALL';
  if (!/^(ALL|[A-Za-z0-9_-]+)$/i.test(employeeCode)) {
    throw new Error('ETIMEOFFICE_EMP_CODE must be ALL or a valid device employee code.');
  }
  const url = new URL(`${baseUrl}/DownloadLastPunchData`);
  url.searchParams.set('Empcode', employeeCode);
  url.searchParams.set('LastRecord', lastRecord);
  const response = await fetch(url, {
    headers: { Authorization: authorization, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.Error) {
    throw new Error(body?.Msg || `e-timeoffice API failed (${response.status})`);
  }
  if (body.IsAdmin === false) throw new Error(body.Msg || 'Team Office API account is not authorized for punch data.');
  if (!Array.isArray(body.PunchData) || typeof body.MaxRecord !== 'string') {
    throw new Error('Team Office returned an unexpected response; no checkpoint was advanced.');
  }
  // The live API returns "0" when there are no new punches. It is an empty
  // result marker, not a cursor for the next request.
  const nextCursor = body.MaxRecord.trim();
  if (body.PunchData.length === 0 && (nextCursor === '0' || nextCursor === '')) {
    body.MaxRecord = lastRecord;
  } else if (!/^(0[1-9]|1[0-2])\d{4}\$\d+$/.test(nextCursor)) {
    throw new Error('Team Office returned an invalid MaxRecord; no checkpoint was advanced.');
  } else {
    body.MaxRecord = nextCursor;
  }
  return body as { Error: false; Msg: string; PunchData: ETimeOfficePunch[]; MaxRecord: string; TableName?: string };
}

export function hrmsEmployeeCode(empcode: string) {
  const normalized = String(empcode).trim();
  if (normalized.toUpperCase().startsWith('MARQ')) return normalized.toUpperCase();
  return `MARQ${normalized.padStart(3, '0')}`;
}
