import { redirect } from 'next/navigation';

// Keep old bookmarks pointed at the tenant-aware Attendance Policy Rules page.
export default function AttendanceSettingsAliasPage() {
  redirect('/attendance/policy-rules');
}
