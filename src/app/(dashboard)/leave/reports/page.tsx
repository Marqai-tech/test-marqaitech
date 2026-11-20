import { redirect } from 'next/navigation';

// /leave/reports → redirect directly to the Overview report.
// The 3 reports (Overview, Balance, LOP) have tab navigation between them.
export default function LeaveReportsPage() {
  redirect('/leave/reports/overview');
}
