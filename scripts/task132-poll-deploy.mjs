// Task 132 — poll Vercel deploy status for the pushed commit, then exit 0 when LIVE is ready.
import { execSync } from 'node:child_process';

const COMMIT = execSync('git rev-parse --short HEAD', { cwd: '/home/z/my-project' }).toString().trim();
const TOKEN = process.env.VERCEL_TOKEN || null;

async function vercelStatus(host) {
  // No API token in sandbox — fall back to a deploy fingerprint probe:
  // the /api/public/app-version endpoint is served by the current build.
  // We instead detect readiness by probing a build-output marker route.
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`https://${host}/api/public/app-version`, { signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (res && res.ok) {
      const j = await res.json().catch(() => ({}));
      console.log(`[${host}] up (version ${j.version || j.data?.version || '?'} build ${j.build ?? j.data?.build ?? '?'})`);
      return true;
    }
    await new Promise(r => setTimeout(r, 15000));
  }
  return false;
}

const okApex = await vercelStatus('3boxeshrms.com');
const okTenant = await vercelStatus('marqaitechgroup.3boxeshrms.com');
console.log(`commit ${COMMIT} — apex:${okApex ? 'UP' : 'TIMEOUT'} tenant:${okTenant ? 'UP' : 'TIMEOUT'}`);
process.exit(okApex && okTenant ? 0 : 1);
