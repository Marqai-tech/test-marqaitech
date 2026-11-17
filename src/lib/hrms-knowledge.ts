/**
 * Task 167b — 3Boxes HRMS product knowledge engine.
 *
 * WHY: the AI assistant's LLM call can fail at the platform level (vendor
 * egress, network, quota). When that happened, /api/ai-chat fell back to ONE
 * canned sentence for every question ("I can help you with leave management,
 * attendance, payroll…"), which is exactly what users complained about.
 *
 * This module is a deterministic, question-specific HRMS answer engine:
 *  - intent detection via stemmed keyword scoring,
 *  - answers grounded in the REAL module paths of this app,
 *  - enriched with the LIVE tenant data passed in by the caller
 *    (holidays, leave types, the employee's own balances).
 *
 * It backs up the LLM (used verbatim when the model call fails) so users
 * always get an apt, correct, HRMS-domain answer.
 */

export interface HrmsLiveContext {
  hasHolidays: boolean;
  holidayList: string;      // pre-formatted "• Name — Day, D Mon YYYY [type]" lines
  hasLeaveTypes: boolean;
  leaveTypeList: string;    // pre-formatted "• Name (CODE): N days/year, …" lines
  hasBalances: boolean;
  balanceList: string;      // pre-formatted "• Type: N remaining of M (U used)" lines
  currentYear: number;
}

interface Intent {
  /** Stemmed / substring keys — matched against the normalized question. */
  keys: string[];
  /** Only fire when the question is short (greetings). */
  shortOnly?: boolean;
  answer: (ctx: HrmsLiveContext) => string;
}

const INTENTS: Intent[] = [
  {
    keys: ['regulariz'],
    answer: () =>
      'Regularization fixes a missed or wrong punch. Go to Attendance → Regularize (/attendance/regularize), pick the date and what needs correcting (missed check-in, check-out, or full day), enter the actual times with a short reason, and submit — the request goes to your reporting manager/HR and your attendance updates once approved. Admins can also raise and approve regularizations for any employee from the same page, which has a month view with bulk actions. If a device punch didn\u2019t register at all, check the punch log (/attendance/punch-log) first.',
  },
  {
    keys: ['holiday'],
    answer: (c) =>
      c.hasHolidays
        ? `Here are the company holidays:\n${c.holidayList}\nThey also appear on the leave calendar (/leave/holidays). HR maintains the calendar under Company → Holidays (/company/holidays), and approved holidays are excluded from attendance calculations.`
        : `The holiday calendar hasn\u2019t been filled in for ${c.currentYear} yet — HR maintains it under Company → Holidays (/company/holidays). Once added, holidays show on the leave calendar (/leave/holidays) and are excluded from attendance calculations.`,
  },
  {
    keys: ['leave balance', 'balances', 'remaining leave', 'leaves left', 'how many leave', 'leave remaining'],
    answer: (c) =>
      c.hasBalances
        ? `Here is your current leave balance (${c.currentYear}):\n${c.balanceList}\nFull details are on Leave → Balance (/leave/balance). Requests still pending approval aren\u2019t deducted yet.`
        : 'Open Leave → Balance (/leave/balance) to see your entitlement, used days, and remaining balance for the year. If nothing appears there, HR needs to generate the year\u2019s leave balances first.',
  },
  {
    keys: ['apply leave', 'leave apply', 'apply for leave', 'request leave', 'take leave', 'apply one day', 'casual leave apply', 'sick leave apply'],
    answer: () =>
      'To apply for leave, open Leave → Apply (/leave/apply): choose the leave type, start and end dates, and add a short reason, then submit. The request routes to your reporting manager (and HR where configured), and the days are deducted from your balance only after approval. You can track the status under Leave → Requests (/leave).',
  },
  {
    keys: ['leave policy', 'leave type', 'entitle', 'carried forward', 'carry forward', 'earned leave', 'casual leave', 'sick leave', 'maternity', 'paternity', 'lop', 'loss of pay'],
    answer: (c) =>
      c.hasLeaveTypes
        ? `The company offers these leave types:\n${c.leaveTypeList}\nFull rules — eligibility, carry-forward, clubbing and notice-period restrictions — are on Leave → Leave Policy (/leave/leave-policy), and the configured types are under Leave → Types (/leave/types).`
        : 'Leave rules (types, entitlement, carry-forward, clubbing restrictions) are on Leave → Leave Policy (/leave/leave-policy), with the configured types under Leave → Types (/leave/types). Ask HR if a rule you need isn\u2019t published there yet.',
  },
  {
    keys: ['payslip', 'pay slip', 'salary slip', 'payroll', 'salary', 'wages', 'tds', 'provident fund', ' pf ', 'esi', 'deduction', 'ctc', 'in hand'],
    answer: () =>
      'Your payslips are under Payroll (/payroll) — open a month to view or download the PDF with earnings and deductions (TDS, PF, ESI as applicable). Your salary structure is in My Profile, shown in INR for Indian-origin employees. If a month is missing, that payroll run hasn\u2019t been processed yet — check with HR.',
  },
  {
    keys: ['my profile', 'update profile', 'edit profile', 'profile update', 'experience', 'achievement', 'verification', 'health record', 'emergency contact', 'personal email', 'change my phone', 'update my number'],
    answer: () =>
      'From My Profile (/my-profile) you can directly edit contact details — phone, personal email, address, and emergency contact. For Experience, Achievements, Documents, Verification, and Health sections, edits are submitted as change requests that route to HR for approval; they update in the system once approved and you can track the request status on the same page.',
  },
  {
    keys: ['policies-handbook', 'policy', 'handbook', 'code of conduct', 'acknowledge', 'acknowledgement', 'acknowledgment', 'dress code', 'company rules'],
    answer: () =>
      'All company policies live in the handbook at /policies-handbook — open any policy to read it and click Read & Acknowledge. Mandatory policies (like the Company Rules) also show as PENDING cards on your ESS Dashboard acknowledgement panel until you acknowledge them.',
  },
  {
    keys: ['biometric', 'face reader', 'punch', 'check in', 'check-in', 'check out', 'check-out', 'clock in', 'attendance marked', 'marked present', 'swipe'],
    answer: () =>
      'Your attendance is under Attendance (/attendance): check in and check out from the dashboard or the mobile app, and punches from biometric/face-reader devices sync automatically from the time office. If a device punch looks wrong or missing, open the punch log (/attendance/punch-log) and then raise a regularization (/attendance/regularize).',
  },
  {
    keys: ['shift', 'overtime', 'comp off', 'comp-off', 'compensatory', 'work from home', 'wfh', 'gatepass', 'gate pass', 'permission', 'late mark', 'half day'],
    answer: () =>
      'Attendance extras live under Attendance: shifts and schedules (/attendance/shifts), overtime (/attendance/overtime), compensatory offs (/attendance/comp-off), work-from-home requests (/attendance/wfh), gate passes (/attendance/gatepass), and short permissions (/attendance/permission). Each request follows the same approval chain — your reporting manager, then HR where configured.',
  },
  {
    keys: ['dashboard', 'ess dashboard', 'home page', 'landing'],
    answer: () =>
      'Your employee home is the ESS Dashboard at /dashboard — attendance summary, leave balance, pending policy acknowledgements, announcements, and notifications. Admins additionally get the Admin Dashboard at /home with company-wide management screens.',
  },
  {
    keys: ['recruit', 'job portal', 'candidate', 'applicant', 'interview', 'hiring', 'offer letter', 'open position', 'vacancy'],
    answer: () =>
      'Recruitment runs at /recruitment — job postings (/job-portal), the candidate pipeline, AI-assisted interview screening, and offers (/offers). HR and managers track requisitions, schedules, and feedback there.',
  },
  {
    keys: ['onboard', 'induction', 'joining formalit', 'new joiner', 'pre-joining', 'preboarding'],
    answer: () =>
      'Onboarding is at /onboarding, with pre-joining tasks at /preboarding — document collection, asset assignment, and induction checklists for new joiners. HR tracks each joiner\u2019s progress through the steps there.',
  },
  {
    keys: ['timesheet', 'time sheet', 'work hours log', 'log hours', 'billable hours'],
    answer: () =>
      'Log and submit your work hours under Timesheets (/timesheets) — weekly grids with project/task allocation and manager approval. Approved hours feed into project costing and payroll where configured.',
  },
  {
    keys: ['expense', 'reimburse', 'claim ', 'travel claim'],
    answer: () =>
      'Submit expense claims under Expenses (/expenses) — pick the category, enter the amount, attach receipts, and the claim routes for manager/finance approval with full status tracking. Travel requests are handled under Travel (/travel).',
  },
  {
    keys: ['asset', 'laptop', 'equipment', 'hardware assign'],
    answer: () =>
      'Assets assigned to you are listed under Assets (/assets) — issue records, condition, and return status for laptops/equipment. If something needs repair or replacement, raise a ticket at Helpdesk (/helpdesk).',
  },
  {
    keys: ['training', 'learning', 'course', 'upskill', 'certification'],
    answer: () =>
      'Training is at /training with courses under Learning (/learning) — assigned programs, upcoming sessions, and completion tracking. Upcoming sessions also surface on your ESS Dashboard.',
  },
  {
    keys: ['helpdesk', 'help desk', 'ticket', 'raise a request', 'it support', 'support request'],
    answer: () =>
      'Raise IT/HR/admin tickets at Helpdesk (/helpdesk) — pick the category, describe the issue, and track SLA and status in the same place. You\u2019ll get notifications as the ticket moves.',
  },
  {
    keys: ['document', 'upload id', 'id proof', 'contract', 'certificate upload'],
    answer: () =>
      'Your document vault is at /documents — upload ID proofs, certificates, and contracts; expiry tracking keeps renewal reminders coming before documents lapse. HR-verified documents show their verification status there.',
  },
  {
    keys: ['chat with', 'direct chat', 'group chat', 'video call', 'social feed', 'announcement'],
    answer: () =>
      'Chat with colleagues under Collaboration (/collaboration) — direct and group chats plus video calls. Company-wide posts and announcements live on the Social Feed (/social-feed), and notifications arrive via the bell icon (/notifications).',
  },
  {
    keys: ['notification', 'alert me', 'reminders'],
    answer: () =>
      'Notifications arrive via the bell icon at /notifications — approvals, announcements, policy-acknowledgement reminders, and mention alerts. Policy reminders also go out by email over the tenant\u2019s verified SMTP.',
  },
  {
    keys: ['what can you do', 'who are you', 'your capabilities', 'help me with', 'what do you do'],
    answer: () =>
      'I\u2019m the 3Boxes HRMS assistant and I answer questions about every module of the product and your HR data — attendance and regularization, leave application and balances, company holidays, payroll and payslips, policies and handbook acknowledgements, profile and document edits, recruitment, onboarding, timesheets, expenses, assets, training, helpdesk, and collaboration. Ask in plain language, e.g. \u201chow do I regularize yesterday\u2019s missed punch?\u201d.',
  },
  {
    keys: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'thanks', 'thank you'],
    shortOnly: true,
    answer: () =>
      'Hi! I\u2019m your 3Boxes HRMS assistant. Try asking \u201chow do I apply for leave?\u201d, \u201cwhat are the company holidays?\u201d, \u201chow can I do regularization?\u201d, or \u201cwhere do I download my payslip?\u201d.',
  },
];

const OVERVIEW =
  'I\u2019m the 3Boxes HRMS assistant — I answer questions about the product and your HR data. Common asks: \u201cHow do I regularize a missed punch?\u201d (Attendance → Regularize), \u201cHow do I apply for leave?\u201d (Leave → Apply), \u201cWhat are the company holidays?\u201d, \u201cWhere is my payslip?\u201d (Payroll), or \u201cHow do I acknowledge a policy?\u201d (Handbook at /policies-handbook). What would you like to do?';

/** Returns a question-specific HRMS answer; never null (falls back to a product overview). */
export function answerFromHrmsKnowledge(question: string, ctx: HrmsLiveContext): string {
  const raw = String(question || '').toLowerCase().trim();
  const q = ` ${raw.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ')} `;
  const shortQuestion = raw.length <= 24;

  let best: { score: number; text: string } | null = null;
  for (const intent of INTENTS) {
    if (intent.shortOnly && !shortQuestion) continue;
    let score = 0;
    for (const key of intent.keys) {
      if (q.includes(key)) score += key.includes(' ') ? 4 : 2;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { score, text: intent.answer(ctx) };
    }
  }
  return best ? best.text : OVERVIEW;
}
