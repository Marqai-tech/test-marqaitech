/**
 * Task 79 — sanity tests for isSafeDocumentUrl (QA Document Link Security)
 * bun scripts/test-doc-url-safety.ts
 */
import { isSafeDocumentUrl } from '../src/lib/sanitize'

const UNSAFE = [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  ' javascript:alert(1)',
  'JAVASCRIPT&#58;alert(1)', // not a scheme — but starts with JAVASCRIPT&#58; → not matched by ^javascript: → falls to default refuse ✓
  'data:text/html,<script>alert(1)</script>',
  'data:text/html;base64,PHNjcmlwdD4=',
  'data:image/svg+xml,<svg onload=alert(1)>',
  'data:;base64,PHNjcmlwdD4=',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
  'blob:https://x/abc',
  '//evil.com/x',
  '/etc/passwd',
  'data:text/plain,hello',
  'about:blank',
]

const SAFE = [
  '',
  'https://drive.google.com/file/d/abc/view',
  'http://intranet.local/docs/offer.pdf',
  'data:application/pdf;base64,JVBERi0xLjQ=',
  'data:image/png;base64,iVBORw0KGgo=',
  'data:image/jpeg;base64,/9j/4AAQ',
  'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEs=',
]

let fail = 0
for (const u of UNSAFE) {
  if (isSafeDocumentUrl(u)) { console.log('FAIL expected-UNSAFE accepted:', JSON.stringify(u)); fail++ }
}
for (const u of SAFE) {
  if (!isSafeDocumentUrl(u)) { console.log('FAIL expected-SAFE rejected:', JSON.stringify(u.slice(0, 60))); fail++ }
}
// null/undefined are safe (optional field)
if (!isSafeDocumentUrl(null) || !isSafeDocumentUrl(undefined)) { console.log('FAIL null/undefined should be safe'); fail++ }

console.log(fail === 0 ? 'ALL URL SAFETY TESTS PASSED' : `${fail} TEST(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
