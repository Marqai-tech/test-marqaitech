import { redirect } from 'next/navigation';

/* Verification & Approvals (BRD 5.9) is merged into the reworked Documents
 * page (per-candidate document review workspace). Any entry point — sidebar,
 * dashboard cards, bookmarks — now lands on the Documents module.
 */
export default function PreboardingVerificationPage() {
  redirect('/preboarding/documents');
}
