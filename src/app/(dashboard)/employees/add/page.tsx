import { redirect } from 'next/navigation';

/**
 * /employees/add — Redirects to the main Employees page with the
 * dynamic add-employee form auto-opened. The main page at /employees
 * already contains the full multi-tab employee creation form
 * (Personal, Address, Employment, Bank, Statutory, Emergency, Health,
 * Overseas, Experience, Policies). Opening it via ?showAddForm=true
 * triggers the useEffect that sets `showForm = true`.
 */
export default function AddEmployeeRedirectPage() {
  redirect('/employees?showAddForm=true');
}
