/**
 * Task 138 — local sanity test for the Aadhaar QR parser (no DB needed).
 * Builds a synthetic legacy numeric QR payload (decimal → bytes → " fields),
 * feeds it plus an Offline XML sample through parseAadhaarPayload, and prints
 * the extraction + comparison results.
 *
 * Usage: node scripts/task138-aadhaar-test.mjs
 */
import { execSync } from 'node:child_process';

const SRC = 'src/lib/aadhaar-qr.ts';
const OUT = '/tmp/aadhaar-qr-test.mjs';
execSync(`npx esbuild ${SRC} --format=esm --platform=node --outfile=${OUT}`, { stdio: 'inherit', cwd: process.cwd() });

const { parseAadhaarPayload, compareAadhaarWithEmployee } = await import(`file://${OUT}`);

function bytesToDecimal(byteStr) {
  let num = 0n;
  for (const ch of byteStr) num = num * 256n + BigInt(ch.charCodeAt(0) & 0xff);
  return num.toString();
}

// Synthetic legacy payload: uid"email"mobile"name"24-08-1992"female"S/O Kumar"12 Main St"…"500034"PHOTOBLOB
const legacy = ['432198761234', 'amrutha@example.com', '9876543210', 'Amrutha Rao', '24-08-1992', 'female', 'S/O Kumar', '12 Main Street', 'Green Park', 'Hyderabad', 'Telangana', '500034', 'PHOTOBINARYBLOB'].join('"');
const numeric = bytesToDecimal(legacy);

const r1 = parseAadhaarPayload(numeric);
console.log('1) legacy numeric QR →', JSON.stringify(r1));
if (!r1.parseable || r1.extracted.name !== 'Amrutha Rao' || r1.extracted.dob !== '1992-08-24' || r1.extracted.gender !== 'female') {
  console.error('FAIL: legacy QR extraction wrong'); process.exit(1);
}

// Offline XML sample
const xml = `<?xml version="1.0"?><OfflinePaperlessKyc><UidData><Poi name="Rahul Sharma" dob="01-01-1990" gender="M" emailhash="x"/><Poa careof="S/O R" house="7-1" street="MG Road" landmark="Near Park" locality="Sector 2" vtc="Pune" subdist="Haveli" dist="Pune" state="Maharashtra" pc="411001"/></UidData></OfflinePaperlessKyc>`;
const r2 = parseAadhaarPayload(xml);
console.log('2) offline XML →', JSON.stringify(r2));
if (!r2.parseable || r2.extracted.name !== 'Rahul Sharma' || r2.extracted.gender !== 'male' || !r2.extracted.address?.includes('411001')) {
  console.error('FAIL: XML extraction wrong'); process.exit(1);
}

// Secure-QR / garbage detection: numeric payload whose bytes are non-printable
const secure = bytesToDecimal(Buffer.from([0x01, 0x02, 0x03, 0xf0, 0xf1, 0xf2, 0x7f, 0x9a, 0xbc, 0xde, 0x01, 0x02]).toString('latin1'));
const r3 = parseAadhaarPayload(secure);
console.log('3) secure/garbage →', r3.format, r3.parseable);
if (r3.parseable) { console.error('FAIL: garbage should not parse'); process.exit(1); }

// Comparison
const cmp = compareAadhaarWithEmployee(r1.extracted, {
  firstName: 'Amrutha', lastName: 'Rao', dateOfBirth: '1992-08-24', gender: 'female',
  address: '12 Main Street', city: 'Hyderabad', state: 'Telangana', zipCode: '500034',
});
console.log('4) comparison →', cmp.status, '|', cmp.summary);
if (cmp.status !== 'verified') { console.error('FAIL: expected verified'); process.exit(1); }

const cmp2 = compareAadhaarWithEmployee(r2.extracted, {
  firstName: 'Rahul', lastName: 'Sharma', dateOfBirth: '1990-01-01', gender: 'male',
  address: 'B-12 Some Other Layout, Mumbai 400001',
});
console.log('5) partial comparison →', cmp2.status, '|', cmp2.summary);

console.log('\nALL AADHAAR PARSER TESTS PASSED');
process.exit(0);
