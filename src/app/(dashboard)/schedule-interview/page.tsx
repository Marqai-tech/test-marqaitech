import { redirect } from 'next/navigation';

// Backward-compatible entry point for older navigation/bookmarks. Interview
// scheduling is intentionally handled in Interview Management so the active
// round and completion gate are always visible.
export default function ScheduleInterviewRedirect() {
  redirect('/interviews');
}
