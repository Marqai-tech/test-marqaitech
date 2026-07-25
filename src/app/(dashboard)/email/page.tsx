'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  FiInbox,
  FiStar,
  FiSend,
  FiFileText,
  FiArchive,
  FiTrash2,
  FiSearch,
  FiEdit3,
  FiPaperclip,
  FiChevronDown,
  FiCornerUpLeft,
  FiCornerUpRight,
  FiMoreVertical,
  FiX,
  FiMail,
} from 'react-icons/fi';

// ─── Types ───────────────────────────────────────────────────────

type FolderId = 'inbox' | 'starred' | 'sent' | 'drafts' | 'archive' | 'trash';

interface EmailAttachment {
  name: string;
  size: string;
  type: string;
}

interface Email {
  id: string;
  folder: FolderId[];
  from: { name: string; email: string; avatar: string };
  to: { name: string; email: string }[];
  cc?: { name: string; email: string }[];
  subject: string;
  preview: string;
  body: string;
  date: string;
  time: string;
  unread: boolean;
  starred: boolean;
  hasAttachment: boolean;
  attachments?: EmailAttachment[];
  label?: string;
  labelColor?: string;
}

interface Folder {
  id: FolderId;
  name: string;
  icon: React.ReactNode;
  count?: number;
}

interface Label {
  name: string;
  color: string;
  count: number;
}

// ─── Sample Data ─────────────────────────────────────────────────

const AVATARS: Record<string, string> = {
  RK: 'bg-green-500',
  SP: 'bg-emerald-500',
  AM: 'bg-teal-500',
  PD: 'bg-amber-500',
  LJ: 'bg-rose-500',
  VG: 'bg-cyan-500',
  NS: 'bg-pink-500',
  TM: 'bg-teal-500',
  BK: 'bg-orange-500',
  HR: 'bg-emerald-400',
  IT: 'bg-sky-500',
  MG: 'bg-lime-600',
};

const getAvatarClass = (initials: string) => AVATARS[initials] || 'bg-slate-500';

const folders: Folder[] = [
  { id: 'inbox', name: 'Inbox', icon: <FiInbox className="w-4 h-4" />, count: 24 },
  { id: 'starred', name: 'Starred', icon: <FiStar className="w-4 h-4" /> },
  { id: 'sent', name: 'Sent', icon: <FiSend className="w-4 h-4" /> },
  { id: 'drafts', name: 'Drafts', icon: <FiFileText className="w-4 h-4" />, count: 3 },
  { id: 'archive', name: 'Archive', icon: <FiArchive className="w-4 h-4" /> },
  { id: 'trash', name: 'Trash', icon: <FiTrash2 className="w-4 h-4" /> },
];

const labels: Label[] = [
  { name: 'HR Updates', color: 'bg-green-400', count: 8 },
  { name: 'Payroll', color: 'bg-emerald-400', count: 5 },
  { name: 'Leave', color: 'bg-amber-400', count: 6 },
  { name: 'Projects', color: 'bg-teal-400', count: 4 },
];

const emails: Email[] = [
  {
    id: 'e1',
    folder: ['inbox'],
    from: { name: 'Rajesh Kumar', email: 'rajesh.kumar@3boxes.com', avatar: 'RK' },
    to: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: 'Leave Request Approved — Casual Leave (Mar 15-16)',
    preview: 'Your casual leave request for March 15-16 has been approved by your manager. Enjoy your time off!',
    body: `Hi,\n\nYour casual leave request for the following dates has been approved:\n\n• Leave Type: Casual Leave\n• Duration: March 15, 2025 - March 16, 2025 (2 days)\n• Reason: Personal work\n• Approved By: Sunita Patel (Reporting Manager)\n\nYour leave balance has been updated accordingly:\n• Casual Leave Remaining: 5 days\n• Sick Leave Remaining: 7 days\n• Earned Leave Remaining: 12 days\n\nPlease ensure proper handover of any pending tasks before your leave.\n\nBest regards,\n3Boxes HRMS Leave Management`,
    date: 'Mar 12',
    time: '10:30 AM',
    unread: true,
    starred: true,
    hasAttachment: false,
    label: 'Leave',
    labelColor: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'e2',
    folder: ['inbox'],
    from: { name: 'Payroll Team', email: 'payroll@3boxes.com', avatar: 'PD' },
    to: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: 'Payslip for February 2025 is now available',
    preview: 'Your payslip for the month of February 2025 has been generated and is ready for download.',
    body: `Dear Employee,\n\nYour payslip for the month of February 2025 has been generated and is now available for download.\n\nEarnings Summary:\n• Basic Salary: ₹50,000\n• HRA: ₹20,000\n• Special Allowance: ₹15,000\n• Transport Allowance: ₹3,000\n\nDeductions Summary:\n• PF (Employee): ₹6,000\n• Professional Tax: ₹200\n• TDS: ₹8,500\n• ESI: ₹875\n\nNet Pay: ₹72,425\n\nPlease log in to the HRMS portal to download your detailed payslip.\n\nNote: If you notice any discrepancy, please raise a ticket through the Helpdesk module within 7 days.\n\nRegards,\nPayroll Department\n3Boxes HRMS`,
    date: 'Mar 1',
    time: '9:00 AM',
    unread: true,
    starred: false,
    hasAttachment: true,
    attachments: [
      { name: 'Payslip_Feb2025.pdf', size: '245 KB', type: 'pdf' },
    ],
    label: 'Payroll',
    labelColor: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 'e3',
    folder: ['inbox'],
    from: { name: 'Ananya Mehra', email: 'ananya.mehra@3boxes.com', avatar: 'AM' },
    to: [{ name: 'All Employees', email: 'all@3boxes.com' }],
    subject: 'Welcome Aboard — New Joiners This Week! 🎉',
    preview: 'We are thrilled to welcome 5 new members to the 3Boxes family this week. Please join us in making them feel at home.',
    body: `Dear Team,\n\nWe are excited to welcome the following new members to the 3Boxes family this week:\n\n1. Arjun Desai — Senior Developer, Engineering\n2. Priya Nair — UX Designer, Design Team\n3. Mohammed Faisal — QA Engineer, Quality Assurance\n4. Divya Sharma — HR Executive, People & Culture\n5. Kunal Joshi — Project Manager, Delivery\n\nPlease join us for a welcome gathering on Friday, March 14 at 4:00 PM in the cafeteria.\n\nLet's make them feel welcome!\n\nBest regards,\nAnanya Mehra\nHead of People & Culture`,
    date: 'Mar 10',
    time: '2:15 PM',
    unread: true,
    starred: false,
    hasAttachment: false,
    label: 'HR Updates',
    labelColor: 'bg-green-100 text-green-700',
  },
  {
    id: 'e4',
    folder: ['inbox'],
    from: { name: 'Lakshmi Joshi', email: 'lakshmi.joshi@3boxes.com', avatar: 'LJ' },
    to: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: 'Updated Company Policies — Effective April 1, 2025',
    preview: 'Please review the updated company policies regarding remote work, dress code, and expense claims effective from April 1.',
    body: `Dear Colleague,\n\nWe have updated the following company policies effective April 1, 2025:\n\n1. Remote Work Policy\n   - Maximum 3 days/week remote work allowed\n   - Mandatory in-office days: Tuesday, Thursday\n   - New approval workflow through HRMS\n\n2. Dress Code Policy\n   - Business casual on all days\n   - Formal attire for client meetings\n   - Casual Fridays extended to all locations\n\n3. Expense Claim Policy\n   - Increased meal allowance to ₹1,500/day\n   - Travel booking must go through portal\n   - 48-hour submission deadline for claims\n\nPlease acknowledge receipt by logging into the HRMS portal.\n\nRegards,\nLakshmi Joshi\nHR Policy Team`,
    date: 'Mar 8',
    time: '11:45 AM',
    unread: true,
    starred: true,
    hasAttachment: true,
    attachments: [
      { name: 'Remote_Work_Policy_2025.pdf', size: '1.2 MB', type: 'pdf' },
      { name: 'Expense_Claim_Policy_2025.pdf', size: '890 KB', type: 'pdf' },
    ],
    label: 'HR Updates',
    labelColor: 'bg-green-100 text-green-700',
  },
  {
    id: 'e5',
    folder: ['inbox'],
    from: { name: 'Vikram Gupta', email: 'vikram.gupta@3boxes.com', avatar: 'VG' },
    to: [{ name: 'Project Team', email: 'project-alpha@3boxes.com' }],
    cc: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: 'Sprint Review Meeting — Project Alpha — Mar 14 at 3 PM',
    preview: 'Inviting you to the Sprint 7 review meeting for Project Alpha. Please come prepared with your updates.',
    body: `Hi Team,\n\nThis is a reminder for our Sprint 7 Review Meeting:\n\n• Date: March 14, 2025 (Friday)\n• Time: 3:00 PM - 4:30 PM\n• Location: Conference Room B / Teams Link\n\nAgenda:\n1. Sprint 7 deliverables review\n2. Demo of new features\n3. Retrospective discussion\n4. Sprint 8 planning preview\n\nPlease come prepared with:\n- Your task completion status\n- Any blockers or dependencies\n- Demo preparation for completed features\n\nLooking forward to a productive session.\n\nBest,\nVikram Gupta\nProject Lead — Alpha`,
    date: 'Mar 11',
    time: '4:00 PM',
    unread: false,
    starred: false,
    hasAttachment: false,
    label: 'Projects',
    labelColor: 'bg-teal-100 text-teal-700',
  },
  {
    id: 'e6',
    folder: ['inbox'],
    from: { name: 'Nisha Singh', email: 'nisha.singh@3boxes.com', avatar: 'NS' },
    to: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: '🎂 Happy Birthday! Have a Wonderful Day!',
    preview: 'Wishing you a very happy birthday from everyone at 3Boxes! May this year bring you success and happiness.',
    body: `Dear Colleague,\n\n🎉 Happy Birthday! 🎂\n\nWishing you a fantastic birthday filled with joy, laughter, and all the things you love!\n\nMay this new year of your life bring:\n• New opportunities and achievements\n• Good health and happiness\n• Wonderful experiences and memories\n\nThe team has planned a small celebration in the break room at 5:00 PM today. We'd love for you to join us!\n\nWarm wishes,\nNisha Singh & The 3Boxes Team`,
    date: 'Mar 9',
    time: '8:00 AM',
    unread: true,
    starred: false,
    hasAttachment: false,
    label: 'HR Updates',
    labelColor: 'bg-green-100 text-green-700',
  },
  {
    id: 'e7',
    folder: ['inbox'],
    from: { name: 'Tushar Mehta', email: 'tushar.mehta@3boxes.com', avatar: 'TM' },
    to: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: 'Performance Review — Q1 2025 Self-Assessment Due',
    preview: 'Reminder: Your Q1 2025 self-assessment is due by March 20. Please complete it in the Performance module.',
    body: `Hi,\n\nThis is a reminder that your Q1 2025 Performance Self-Assessment is due by March 20, 2025.\n\nPlease complete the following in the Performance module:\n\n1. Self-Assessment Form\n   - Key achievements this quarter\n   - Challenges faced and how you overcame them\n   - Goals for next quarter\n\n2. OKR Update\n   - Update progress on your OKRs\n   - Add comments for each key result\n\n3. 360° Feedback\n   - Submit peer nominations for feedback\n\nTimeline:\n• Self-Assessment Due: March 20\n• Manager Review: March 21-28\n• Calibration: April 1-5\n• Final Ratings: April 10\n\nPlease reach out if you have any questions.\n\nRegards,\nTushar Mehta\nHR — Performance Management`,
    date: 'Mar 7',
    time: '10:00 AM',
    unread: false,
    starred: true,
    hasAttachment: true,
    attachments: [
      { name: 'Q1_Self_Assessment_Template.docx', size: '56 KB', type: 'docx' },
    ],
    label: 'HR Updates',
    labelColor: 'bg-green-100 text-green-700',
  },
  {
    id: 'e8',
    folder: ['inbox'],
    from: { name: 'IT Helpdesk', email: 'it-helpdesk@3boxes.com', avatar: 'IT' },
    to: [{ name: 'All Employees', email: 'all@3boxes.com' }],
    subject: 'Scheduled Maintenance — HRMS Downtime on Mar 16',
    preview: 'The HRMS system will be under scheduled maintenance on March 16 from 2 AM to 6 AM IST. Plan accordingly.',
    body: `Dear All,\n\nThis is to inform you that the HRMS system will undergo scheduled maintenance:\n\n• Date: March 16, 2025 (Sunday)\n• Time: 2:00 AM - 6:00 AM IST\n• Duration: Approximately 4 hours\n\nDuring this period, the following services will be unavailable:\n- HRMS Portal (Web & Mobile)\n- Email notifications\n- API integrations\n- Biometric sync\n\nAction Required:\n- Submit any pending attendance regularizations before March 15\n- Download any required documents in advance\n- Mark attendance manually if your shift falls during maintenance\n\nWe apologize for the inconvenience. The system will be back with improved performance.\n\nRegards,\nIT Infrastructure Team\n3Boxes`,
    date: 'Mar 6',
    time: '3:30 PM',
    unread: false,
    starred: false,
    hasAttachment: false,
  },
  {
    id: 'e9',
    folder: ['inbox'],
    from: { name: 'Sunita Patel', email: 'sunita.patel@3boxes.com', avatar: 'SP' },
    to: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: 'Re: Leave Request — Need Additional Information',
    preview: 'I need some additional details regarding your leave request for March 25-28. Can you clarify the reason?',
    body: `Hi,\n\nI received your leave request for March 25-28 (4 days). Before I can process it, I need some clarification:\n\n1. Is this related to the ongoing project deliverables for Sprint 8?\n2. Have you coordinated with Vikram for task handover?\n3. The leave type selected is "Casual Leave" — would "Earned Leave" be more appropriate given the duration?\n\nPlease update the request with the necessary details so I can review it promptly.\n\nThanks,\nSunita Patel\nReporting Manager`,
    date: 'Mar 5',
    time: '11:20 AM',
    unread: true,
    starred: false,
    hasAttachment: false,
    label: 'Leave',
    labelColor: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'e10',
    folder: ['inbox'],
    from: { name: 'Bharat Kapoor', email: 'bharat.kapoor@3boxes.com', avatar: 'BK' },
    to: [{ name: 'All Managers', email: 'managers@3boxes.com' }],
    cc: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: 'Q1 Town Hall — March 20 at 11 AM',
    preview: 'Invitation to the Q1 Town Hall meeting. CEO will present quarterly results and strategic updates.',
    body: `Dear Managers,\n\nYou are invited to the Q1 2025 Town Hall:\n\n• Date: March 20, 2025\n• Time: 11:00 AM - 12:30 PM\n• Venue: Main Auditorium & Teams Live\n\nAgenda:\n1. Q1 Financial Results — CFO Presentation\n2. Strategic Roadmap Update — CEO\n3. Employee Recognition Awards\n4. Open Q&A Session\n\nPlease encourage your team members to attend. The session will be recorded for those who cannot join live.\n\nSubmit your questions in advance through the HRMS portal.\n\nBest regards,\nBharat Kapoor\nExecutive Assistant to CEO`,
    date: 'Mar 4',
    time: '9:15 AM',
    unread: false,
    starred: false,
    hasAttachment: false,
    label: 'HR Updates',
    labelColor: 'bg-green-100 text-green-700',
  },
  {
    id: 'e11',
    folder: ['inbox'],
    from: { name: 'HR Department', email: 'hr@3boxes.com', avatar: 'HR' },
    to: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: 'Work Anniversary — 3 Years at 3Boxes! 🏆',
    preview: 'Congratulations on completing 3 years at 3Boxes! Thank you for your dedication and contributions.',
    body: `Dear Colleague,\n\n🏆 Congratulations!\n\nToday marks your 3rd work anniversary with 3Boxes! We want to take this moment to appreciate your dedication, hard work, and the value you bring to our team.\n\nYour Journey:\n• Joined: March 5, 2022\n• Current Role: Senior Software Engineer\n• Projects Contributed: 12\n• Team Members Mentored: 5\n\nAs a token of appreciation, a gift voucher will be credited to your wallet in the HRMS portal.\n\nWe look forward to many more years of growth together!\n\nWarm regards,\nHR Department\n3Boxes`,
    date: 'Mar 5',
    time: '7:00 AM',
    unread: true,
    starred: false,
    hasAttachment: false,
    label: 'HR Updates',
    labelColor: 'bg-green-100 text-green-700',
  },
  {
    id: 'e12',
    folder: ['inbox'],
    from: { name: 'Maya Goyal', email: 'maya.goyal@3boxes.com', avatar: 'MG' },
    to: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: 'Training Enrollment Confirmed — Advanced React Workshop',
    preview: 'Your enrollment for the Advanced React Workshop on March 22-23 has been confirmed. Details inside.',
    body: `Hi,\n\nYour enrollment has been confirmed for the following training:\n\n• Course: Advanced React Workshop\n• Date: March 22-23, 2025\n• Time: 10:00 AM - 5:00 PM\n• Mode: In-person (Training Room 3)\n• Instructor: External Trainer — Mr. Arvind Kumar\n\nPre-requisites:\n- Bring your laptop with Node.js 20+ installed\n- Complete the pre-work module in the LMS\n- Review the React patterns documentation (attached)\n\nCertificate will be issued upon completion and assessment.\n\nRegards,\nMaya Goyal\nL&D Team`,
    date: 'Mar 3',
    time: '1:30 PM',
    unread: false,
    starred: false,
    hasAttachment: true,
    attachments: [
      { name: 'React_Patterns_PreWork.pdf', size: '2.1 MB', type: 'pdf' },
    ],
  },
  {
    id: 'e13',
    folder: ['inbox'],
    from: { name: 'Rajesh Kumar', email: 'rajesh.kumar@3boxes.com', avatar: 'RK' },
    to: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: 'Re: Reimbursement Claim — Travel Expense Approved',
    preview: 'Your travel expense claim of ₹15,750 for the Mumbai visit has been approved and will be processed in the next payroll.',
    body: `Hi,\n\nYour reimbursement claim has been approved:\n\n• Claim ID: REIM-2025-0142\n• Type: Travel Expense\n• Amount: ₹15,750\n• Visit: Mumbai Client Meeting (Feb 20-22)\n• Approved By: Sunita Patel\n\nThe amount will be credited along with your March salary.\n\nBreakdown:\n- Flight: ₹8,500\n- Hotel: ₹4,200\n- Meals: ₹1,800\n- Local Transport: ₹1,250\n\nRegards,\nRajesh Kumar\nFinance Team`,
    date: 'Mar 2',
    time: '4:45 PM',
    unread: true,
    starred: false,
    hasAttachment: true,
    attachments: [
      { name: 'Travel_Claim_Receipts.zip', size: '3.4 MB', type: 'zip' },
    ],
    label: 'Payroll',
    labelColor: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 'e14',
    folder: ['inbox'],
    from: { name: 'Vikram Gupta', email: 'vikram.gupta@3boxes.com', avatar: 'VG' },
    to: [{ name: 'Project Team', email: 'project-alpha@3boxes.com' }],
    subject: 'New Project Kickoff — Project Beta — Action Required',
    preview: 'We are kicking off Project Beta next week. Your role assignment and initial tasks have been updated in the portal.',
    body: `Hi Team,\n\nProject Beta is officially kicking off on March 17, 2025!\n\nProject Details:\n• Client: GlobalTech Solutions\n• Duration: 6 months\n• Team Size: 12 members\n• Tech Stack: Next.js, TypeScript, PostgreSQL\n• Methodology: Agile (2-week sprints)\n\nYour Role Assignment:\n- Lead Developer\n- Initial tasks have been assigned in the HRMS portal\n\nKey Milestones:\n1. Requirements Gathering: Week 1-2\n2. Design Phase: Week 3-4\n3. Sprint 1 Start: April 1\n4. UAT: August 15\n5. Go-Live: September 1\n\nPlease review your tasks and confirm availability by EOD Friday.\n\nBest,\nVikram Gupta\nDelivery Manager`,
    date: 'Mar 1',
    time: '10:00 AM',
    unread: false,
    starred: true,
    hasAttachment: false,
    label: 'Projects',
    labelColor: 'bg-teal-100 text-teal-700',
  },
  {
    id: 'e15',
    folder: ['inbox'],
    from: { name: 'Ananya Mehra', email: 'ananya.mehra@3boxes.com', avatar: 'AM' },
    to: [{ name: 'All Employees', email: 'all@3boxes.com' }],
    subject: 'Annual Health Checkup — Schedule Your Appointment',
    preview: 'Annual health checkup camp is organized from March 18-22. Please book your slot through the HRMS portal.',
    body: `Dear Team,\n\nWe are organizing our Annual Health Checkup Camp:\n\n• Dates: March 18-22, 2025\n• Time: 9:00 AM - 5:00 PM\n• Venue: Office Premises — Wellness Room\n• Provider: Apollo Hospitals\n\nTests Included:\n- Complete Blood Count\n- Lipid Profile\n- Liver Function Test\n- Kidney Function Test\n- Thyroid Profile\n- ECG\n- Vision Test\n- BMI Assessment\n\nHow to Book:\n1. Log in to HRMS portal\n2. Go to Wellness > Health Checkup\n3. Select your preferred date and time slot\n4. Confirm booking\n\nDeadline: March 15, 2025\n\nFasting of 10-12 hours is required for accurate blood test results.\n\nStay healthy!\nAnanya Mehra\nPeople & Culture Team`,
    date: 'Feb 28',
    time: '2:00 PM',
    unread: false,
    starred: false,
    hasAttachment: false,
    label: 'HR Updates',
    labelColor: 'bg-green-100 text-green-700',
  },
  {
    id: 'e16',
    folder: ['inbox'],
    from: { name: 'Payroll Team', email: 'payroll@3boxes.com', avatar: 'PD' },
    to: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: 'Investment Declaration — Submit Proof by March 31',
    preview: 'Reminder to submit your investment declaration proofs for FY 2024-25 before the March 31 deadline.',
    body: `Dear Employee,\n\nThis is a final reminder to submit your investment declaration proofs for FY 2024-25.\n\nDeadline: March 31, 2025\n\nPending Items:\n• Section 80C: ₹1,50,000 (PPF, ELSS, Insurance)\n• Section 80D: Health Insurance Premium\n• HRA Exemption: Rent receipts\n• Home Loan: Interest & Principal certificates\n\nHow to Submit:\n1. Log in to HRMS > Payroll > Investment Declaration\n2. Upload supporting documents\n3. Submit for verification\n\nFailure to submit proofs will result in higher TDS deduction in the final months.\n\nCurrent TDS Projection:\n• With proofs: ₹8,500/month\n• Without proofs: ₹14,200/month\n\nTake action now to optimize your tax!\n\nRegards,\nPayroll Team\n3Boxes HRMS`,
    date: 'Feb 25',
    time: '9:00 AM',
    unread: true,
    starred: false,
    hasAttachment: false,
    label: 'Payroll',
    labelColor: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 'e17',
    folder: ['inbox'],
    from: { name: 'Lakshmi Joshi', email: 'lakshmi.joshi@3boxes.com', avatar: 'LJ' },
    to: [{ name: 'All Employees', email: 'all@3boxes.com' }],
    subject: 'Holiday List 2025 — Updated with Optional Holidays',
    preview: 'The 2025 holiday list has been updated with optional holidays. Please select your 2 optional holidays by March 15.',
    body: `Dear Team,\n\nThe 2025 holiday list has been finalized. In addition to the 10 mandatory holidays, you can choose 2 optional holidays:\n\nOptional Holidays:\n1. Good Friday — April 18\n2. Eid ul-Fitr — March 31\n3. Buddha Purnima — May 12\n4. Janmashtami — August 26\n5. Mahavir Jayanti — April 10\n6. Guru Nanak Jayanti — November 5\n\nPlease select your 2 optional holidays in the HRMS portal under Leave > Optional Holidays.\n\nDeadline: March 15, 2025\n\nRegards,\nLakshmi Joshi\nHR Policy Team`,
    date: 'Feb 22',
    time: '11:00 AM',
    unread: false,
    starred: false,
    hasAttachment: true,
    attachments: [
      { name: 'Holiday_List_2025.pdf', size: '180 KB', type: 'pdf' },
    ],
    label: 'Leave',
    labelColor: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'e18',
    folder: ['inbox'],
    from: { name: 'Sunita Patel', email: 'sunita.patel@3boxes.com', avatar: 'SP' },
    to: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: 'Team Building Event — Adventure Day on March 29',
    preview: 'Join us for an exciting team building adventure day! Activities include trekking, obstacle course, and more.',
    body: `Hi Team,\n\nWe're organizing an exciting Team Building Event!\n\n• Date: March 29, 2025 (Saturday)\n• Time: 8:00 AM - 6:00 PM\n• Venue: Adventure Park, outskirts of city\n• Transport: Bus from office at 7:30 AM\n\nActivities:\n- Morning Trek (Moderate difficulty)\n- Obstacle Course Challenge\n- Team Games & Competitions\n- Lunch by the Lake\n- Photography Contest\n\nWhat to Bring:\n- Comfortable sports clothing\n- Walking/trekking shoes\n- Sunscreen & hat\n- Water bottle\n\nRSVP through the HRMS portal by March 20.\n\nLet's make it a memorable day!\n\nSunita Patel\nTeam Lead`,
    date: 'Feb 20',
    time: '3:00 PM',
    unread: false,
    starred: false,
    hasAttachment: false,
  },
  {
    id: 'e19',
    folder: ['inbox'],
    from: { name: 'IT Helpdesk', email: 'it-helpdesk@3boxes.com', avatar: 'IT' },
    to: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: 'Password Expiry Notice — Reset Before March 18',
    preview: 'Your HRMS portal password will expire on March 18. Please reset it before the deadline to avoid login issues.',
    body: `Dear User,\n\nYour HRMS portal password will expire in 7 days.\n\n• Expiry Date: March 18, 2025\n• Days Remaining: 7\n\nPlease reset your password before the expiry date to avoid:\n- Login disruption\n- Attendance marking issues\n- Payslip access problems\n\nPassword Requirements:\n- Minimum 8 characters\n- At least 1 uppercase letter\n- At least 1 number\n- At least 1 special character\n- Cannot reuse last 5 passwords\n\nHow to Reset:\n1. Log in to HRMS\n2. Go to Settings > Security > Change Password\n3. Enter current and new password\n4. Confirm and save\n\nRegards,\nIT Security Team`,
    date: 'Mar 11',
    time: '8:00 AM',
    unread: true,
    starred: false,
    hasAttachment: false,
  },
  {
    id: 'e20',
    folder: ['inbox'],
    from: { name: 'Vikram Gupta', email: 'vikram.gupta@3boxes.com', avatar: 'VG' },
    to: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: 'Client Feedback — Great Work on Sprint 6 Demo!',
    preview: 'The client was very impressed with the Sprint 6 demo. Special appreciation for your work on the reporting module.',
    body: `Hi,\n\nGreat news! The client feedback from Sprint 6 demo is extremely positive:\n\nHighlights:\n- "Reporting module is exactly what we needed"\n- "Performance improvements are noticeable"\n- "UI/UX changes are a big step forward"\n\nSpecial Recognition:\nYour work on the reporting module was specifically praised by the client CTO. This will be noted in your Q1 performance review.\n\nKeep up the excellent work! 🎯\n\nBest,\nVikram Gupta\nProject Lead`,
    date: 'Feb 18',
    time: '5:30 PM',
    unread: false,
    starred: true,
    hasAttachment: false,
    label: 'Projects',
    labelColor: 'bg-teal-100 text-teal-700',
  },
  {
    id: 'e21',
    folder: ['inbox'],
    from: { name: 'Ananya Mehra', email: 'ananya.mehra@3boxes.com', avatar: 'AM' },
    to: [{ name: 'All Employees', email: 'all@3boxes.com' }],
    subject: 'Referral Program — Refer & Earn ₹25,000!',
    preview: 'We are launching the Q2 referral program. Refer a candidate and earn ₹25,000 per successful hire!',
    body: `Dear Team,\n\nWe're excited to launch the Q2 2025 Referral Program!\n\nReferral Bonus: ₹25,000 per successful hire\n\nOpen Positions:\n1. Senior Backend Developer\n2. UI/UX Designer\n3. Data Engineer\n4. DevOps Engineer\n5. Business Analyst\n\nHow to Refer:\n1. Go to HRMS > Recruitment > Referrals\n2. Enter candidate details\n3. Upload their resume\n4. Track status in the portal\n\nBonus Payout:\n- 50% after candidate joins\n- 50% after 3-month completion\n\nTop referrers get additional rewards!\n\nHappy Referring!\nAnanya Mehra\nPeople & Culture`,
    date: 'Feb 15',
    time: '10:00 AM',
    unread: false,
    starred: false,
    hasAttachment: false,
    label: 'HR Updates',
    labelColor: 'bg-green-100 text-green-700',
  },
  {
    id: 'e22',
    folder: ['inbox'],
    from: { name: 'Payroll Team', email: 'payroll@3boxes.com', avatar: 'PD' },
    to: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: 'Form 16 — Available for Download',
    preview: 'Your Form 16 for FY 2023-24 is now available for download from the HRMS portal.',
    body: `Dear Employee,\n\nYour Form 16 for FY 2023-24 is now available for download.\n\nForm 16 contains:\n- Part A: TDS details from employer\n- Part B: Salary break-up and deductions\n\nHow to Download:\n1. Log in to HRMS\n2. Go to Payroll > Tax Documents\n3. Click "Download Form 16"\n\nThis document is required for filing your Income Tax Return.\n\nNote: Please verify all details. In case of discrepancy, contact payroll within 15 days.\n\nRegards,\nPayroll Team\n3Boxes HRMS`,
    date: 'Feb 10',
    time: '9:30 AM',
    unread: false,
    starred: false,
    hasAttachment: true,
    attachments: [
      { name: 'Form16_FY2023-24.pdf', size: '320 KB', type: 'pdf' },
    ],
    label: 'Payroll',
    labelColor: 'bg-emerald-100 text-emerald-700',
  },
  // Sent emails
  {
    id: 'e23',
    folder: ['sent'],
    from: { name: 'Me', email: 'me@3boxes.com', avatar: 'ME' },
    to: [{ name: 'Sunita Patel', email: 'sunita.patel@3boxes.com' }],
    subject: 'Leave Request — Casual Leave for March 25-28',
    preview: 'Requesting 4 days of casual leave from March 25-28 for personal reasons. Work handover plan attached.',
    body: `Hi Sunita,\n\nI would like to request casual leave for the following dates:\n\n• Duration: March 25-28, 2025 (4 days)\n• Type: Casual Leave\n• Reason: Personal work\n\nWork Handover Plan:\n- Vikram has agreed to cover my Sprint 8 tasks\n- All pending code reviews will be completed before March 24\n- Client communication will be handled by the team lead\n\nPlease let me know if you need any additional information.\n\nThanks`,
    date: 'Mar 4',
    time: '3:00 PM',
    unread: false,
    starred: false,
    hasAttachment: true,
    attachments: [
      { name: 'Handover_Plan.docx', size: '45 KB', type: 'docx' },
    ],
    label: 'Leave',
    labelColor: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'e24',
    folder: ['sent'],
    from: { name: 'Me', email: 'me@3boxes.com', avatar: 'ME' },
    to: [{ name: 'Vikram Gupta', email: 'vikram.gupta@3boxes.com' }],
    subject: 'Sprint 6 Demo — Reporting Module Walkthrough',
    preview: 'Attached is the demo video and presentation for the reporting module showcase in Sprint 6 review.',
    body: `Hi Vikram,\n\nPlease find attached the demo materials for Sprint 6:\n\n1. Demo Video (5 min walkthrough)\n2. Feature Presentation\n3. Performance Benchmark Results\n\nKey Highlights:\n- Report generation time reduced by 60%\n- Added 5 new report templates\n- Excel/PDF export now supported\n- Real-time data refresh\n\nLet me know if you need anything else for the client demo.\n\nBest regards`,
    date: 'Feb 17',
    time: '2:00 PM',
    unread: false,
    starred: false,
    hasAttachment: true,
    attachments: [
      { name: 'Sprint6_Demo.mp4', size: '45 MB', type: 'video' },
      { name: 'Reporting_Module_Presentation.pptx', size: '8.5 MB', type: 'pptx' },
    ],
    label: 'Projects',
    labelColor: 'bg-teal-100 text-teal-700',
  },
  {
    id: 'e25',
    folder: ['sent'],
    from: { name: 'Me', email: 'me@3boxes.com', avatar: 'ME' },
    to: [{ name: 'HR Department', email: 'hr@3boxes.com' }],
    subject: 'Investment Declaration — FY 2024-25 Proofs Uploaded',
    preview: 'I have uploaded all my investment declaration proofs for FY 2024-25. Please review and confirm.',
    body: `Dear HR Team,\n\nI have uploaded the following investment declaration proofs for FY 2024-25:\n\n1. PPF Account Statement — ₹1,50,000\n2. ELSS Fund Statement — ₹50,000\n3. Health Insurance Premium — ₹35,000\n4. Rent Receipts (HRA) — ₹12,000/month\n5. Home Loan Interest Certificate — ₹2,40,000\n\nPlease review and confirm the receipt. Let me know if any additional documents are needed.\n\nThanks`,
    date: 'Feb 24',
    time: '4:30 PM',
    unread: false,
    starred: false,
    hasAttachment: true,
    attachments: [
      { name: 'Investment_Proofs_2024-25.zip', size: '5.2 MB', type: 'zip' },
    ],
    label: 'Payroll',
    labelColor: 'bg-emerald-100 text-emerald-700',
  },
  // Draft emails
  {
    id: 'e26',
    folder: ['drafts'],
    from: { name: 'Me', email: 'me@3boxes.com', avatar: 'ME' },
    to: [{ name: 'Tushar Mehta', email: 'tushar.mehta@3boxes.com' }],
    subject: 'Q1 Self-Assessment — Draft',
    preview: '[Draft] Key achievements this quarter: Led reporting module development, mentored 2 junior devs...',
    body: `Hi Tushar,\n\nHere's my Q1 self-assessment draft:\n\nKey Achievements:\n1. Led the development of the Reporting Module — delivered on time\n2. Reduced API response time by 40% through optimization\n3. Mentored 2 junior developers — both now handling independent tasks\n\nChallenges:\n1. Resource constraints during Sprint 5\n2. Client scope changes in mid-sprint\n\nGoals for Q2:\n1. Complete Project Beta kickoff deliverables\n2. Achieve 95% code coverage\n3. Conduct 3 knowledge-sharing sessions\n\n[Still editing...]`,
    date: 'Mar 10',
    time: '8:00 PM',
    unread: false,
    starred: false,
    hasAttachment: false,
  },
  {
    id: 'e27',
    folder: ['drafts'],
    from: { name: 'Me', email: 'me@3boxes.com', avatar: 'ME' },
    to: [{ name: '', email: '' }],
    subject: 'Team Lunch Invitation — March End',
    preview: '[Draft] Hey team, planning a team lunch to celebrate the successful Sprint 6 delivery...',
    body: `Hey Team,\n\nPlanning a team lunch to celebrate our successful Sprint 6 delivery! 🎉\n\nProposed Date: March 28 (Friday)\nVenue: [To be decided]\nBudget: Team entertainment fund\n\nOptions:\n1. Italian — La Pizzeria\n2. Indian — Spice Garden\n3. Pan-Asian — Wok & Roll\n\nPlease vote for your preference by replying to this email.\n\n[Still editing...]`,
    date: 'Mar 9',
    time: '6:00 PM',
    unread: false,
    starred: false,
    hasAttachment: false,
  },
  {
    id: 'e28',
    folder: ['drafts'],
    from: { name: 'Me', email: 'me@3boxes.com', avatar: 'ME' },
    to: [{ name: 'Ananya Mehra', email: 'ananya.mehra@3boxes.com' }],
    subject: 'Referral — Senior Backend Developer Candidate',
    preview: '[Draft] Hi Ananya, I would like to refer a candidate for the Senior Backend Developer position...',
    body: `Hi Ananya,\n\nI would like to refer a candidate for the Senior Backend Developer position:\n\n• Name: Rohit Verma\n• Current Company: TechCorp Solutions\n• Experience: 6 years\n• Skills: Node.js, TypeScript, PostgreSQL, AWS\n• Notice Period: 30 days\n\nI have worked with Rohit on a previous project and can vouch for his technical expertise and team collaboration skills.\n\n[Need to attach resume]`,
    date: 'Mar 8',
    time: '10:30 PM',
    unread: false,
    starred: false,
    hasAttachment: false,
  },
  // Archived emails
  {
    id: 'e29',
    folder: ['archive'],
    from: { name: 'HR Department', email: 'hr@3boxes.com', avatar: 'HR' },
    to: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: 'Onboarding Checklist — Welcome to 3Boxes!',
    preview: 'Welcome to 3Boxes! Please complete the following onboarding tasks within your first week.',
    body: `Dear New Joinee,\n\nWelcome to 3Boxes! 🎉\n\nPlease complete the following onboarding tasks within your first week:\n\nDay 1:\n- Complete personal details in HRMS\n- Submit ID proofs and documents\n- Collect access card and laptop\n- Attend orientation session\n\nDay 2-3:\n- Complete IT setup (email, tools, VPN)\n- Meet your team and manager\n- Review project documentation\n\nDay 4-5:\n- Complete mandatory compliance training\n- Set up your OKRs with your manager\n- Explore the HRMS portal features\n\nWelcome aboard!\nHR Team`,
    date: 'Mar 5, 2022',
    time: '8:00 AM',
    unread: false,
    starred: true,
    hasAttachment: true,
    attachments: [
      { name: 'Onboarding_Checklist.pdf', size: '120 KB', type: 'pdf' },
    ],
  },
  {
    id: 'e30',
    folder: ['archive'],
    from: { name: 'IT Helpdesk', email: 'it-helpdesk@3boxes.com', avatar: 'IT' },
    to: [{ name: 'Me', email: 'me@3boxes.com' }],
    subject: 'VPN Configuration — Setup Instructions',
    preview: 'Follow these instructions to set up VPN access for remote work. Configuration details attached.',
    body: `Dear User,\n\nHere are your VPN setup instructions:\n\n1. Download the VPN client from the IT portal\n2. Install using default settings\n3. Import the configuration file (attached)\n4. Use your HRMS credentials to connect\n5. Select "3Boxes-Remote" gateway\n\nIf you face any issues, contact IT Helpdesk at ext. 555.\n\nIT Team`,
    date: 'Jan 15, 2025',
    time: '10:00 AM',
    unread: false,
    starred: false,
    hasAttachment: true,
    attachments: [
      { name: 'VPN_Config.ovpn', size: '4 KB', type: 'config' },
    ],
  },
  // Trash emails
  {
    id: 'e31',
    folder: ['trash'],
    from: { name: 'Marketing Team', email: 'marketing@3boxes.com', avatar: 'MG' },
    to: [{ name: 'All Employees', email: 'all@3boxes.com' }],
    subject: 'Newsletter — February 2025 Edition',
    preview: 'Monthly newsletter with company updates, events, and employee spotlights.',
    body: `Dear Team,\n\nFebruary 2025 Newsletter Highlights:\n- New office expansion plans\n- Employee of the Month: Priya Nair\n- Upcoming events and workshops\n- Cricket tournament results\n\nRead the full newsletter on the intranet.\n\nMarketing Team`,
    date: 'Feb 1',
    time: '9:00 AM',
    unread: false,
    starred: false,
    hasAttachment: false,
  },
];

// ─── Helper ──────────────────────────────────────────────────────

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

const getFileIcon = (type: string) => {
  switch (type) {
    case 'pdf':
      return <FiFileText className="w-4 h-4 text-red-500" />;
    case 'docx':
      return <FiFileText className="w-4 h-4 text-green-500" />;
    case 'zip':
      return <FiFileText className="w-4 h-4 text-amber-500" />;
    case 'pptx':
      return <FiFileText className="w-4 h-4 text-orange-500" />;
    case 'video':
      return <FiFileText className="w-4 h-4 text-teal-500" />;
    default:
      return <FiFileText className="w-4 h-4 text-slate-500" />;
  }
};

// ─── Component ───────────────────────────────────────────────────

export default function EmailPage() {
  const [selectedFolder, setSelectedFolder] = useState<FolderId>('inbox');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [starredFilter, setStarredFilter] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  // Compose form state
  const [composeTo, setComposeTo] = useState('');
  const [composeCC, setComposeCC] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');

  const filteredEmails = useMemo(() => {
    let result: Email[] = [];

    if (selectedFolder === 'starred') {
      result = emails.filter((e) => e.starred);
    } else {
      result = emails.filter((e) => e.folder.includes(selectedFolder));
    }

    if (activeLabel) {
      result = result.filter((e) => e.label === activeLabel);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.subject.toLowerCase().includes(q) ||
          e.from.name.toLowerCase().includes(q) ||
          e.preview.toLowerCase().includes(q)
      );
    }

    return result;
  }, [selectedFolder, searchQuery, activeLabel]);

  const selectedEmail = useMemo(
    () => emails.find((e) => e.id === selectedEmailId) || null,
    [selectedEmailId]
  );

  const folderCounts = useMemo(() => {
    const counts: Record<FolderId, number> = {
      inbox: emails.filter((e) => e.folder.includes('inbox') && e.unread).length,
      starred: emails.filter((e) => e.starred).length,
      sent: emails.filter((e) => e.folder.includes('sent')).length,
      drafts: emails.filter((e) => e.folder.includes('drafts')).length,
      archive: emails.filter((e) => e.folder.includes('archive')).length,
      trash: emails.filter((e) => e.folder.includes('trash')).length,
    };
    return counts;
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedEmails.size === filteredEmails.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(filteredEmails.map((e) => e.id)));
    }
  }, [filteredEmails, selectedEmails]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleStar = useCallback((id: string) => {
    const idx = emails.findIndex((e) => e.id === id);
    if (idx !== -1) emails[idx].starred = !emails[idx].starred;
  }, []);

  const handleSend = useCallback(() => {
    setShowCompose(false);
    setComposeTo('');
    setComposeCC('');
    setComposeSubject('');
    setComposeBody('');
  }, []);

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-thb-text-primary">Email Inbox</h1>
          <p className="text-sm text-thb-text-secondary mt-0.5">
            Manage your HR communications and notifications
          </p>
        </div>
        <button
          onClick={() => setShowCompose(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all"
          style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}
        >
          <FiEdit3 className="w-4 h-4" />
          Compose
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-0 thb-card overflow-hidden min-h-0">
        {/* ─── Left Sidebar ─── */}
        <div className="w-64 shrink-0 border-r border-thb-border bg-thb-card-bg flex flex-col">
          {/* Folders */}
          <div className="p-3 flex-1 overflow-y-auto">
            <div className="space-y-0.5">
              {folders.map((folder) => {
                const isActive = selectedFolder === folder.id && !activeLabel;
                return (
                  <button
                    key={folder.id}
                    onClick={() => {
                      setSelectedFolder(folder.id);
                      setActiveLabel(null);
                      setSelectedEmailId(null);
                      setSearchQuery('');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-green-50 text-green-700'
                        : 'text-thb-text-secondary hover:bg-slate-50 hover:text-thb-text-primary'
                    }`}
                  >
                    <span className={isActive ? 'text-green-500' : 'text-thb-text-muted'}>
                      {folder.icon}
                    </span>
                    <span className="flex-1 text-left">{folder.name}</span>
                    {folder.count !== undefined && folder.count > 0 && (
                      <span
                        className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-green-100 text-green-600'
                            : 'bg-slate-100 text-thb-text-muted'
                        }`}
                      >
                        {folder.id === 'inbox'
                          ? folderCounts.inbox
                          : folder.id === 'drafts'
                          ? folderCounts.drafts
                          : folder.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Separator */}
            <div className="border-t border-thb-border my-4" />

            {/* Labels */}
            <div>
              <h3 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider px-3 mb-2">
                Labels
              </h3>
              <div className="space-y-0.5">
                {labels.map((label) => {
                  const isActive = activeLabel === label.name;
                  return (
                    <button
                      key={label.name}
                      onClick={() => {
                        setActiveLabel(isActive ? null : label.name);
                        setSelectedEmailId(null);
                        if (!isActive) setSelectedFolder('inbox');
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'bg-slate-50 text-thb-text-primary font-medium'
                          : 'text-thb-text-secondary hover:bg-slate-50 hover:text-thb-text-primary'
                      }`}
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${label.color}`}
                      />
                      <span className="flex-1 text-left">{label.name}</span>
                      <span className="text-xs text-thb-text-muted font-medium">
                        {label.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-thb-border my-4" />

            {/* Quick Stats */}
            <div className="px-3">
              <h3 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">
                Quick Stats
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-thb-text-secondary">Unread</span>
                  <span className="text-xs font-semibold text-green-600">
                    {emails.filter((e) => e.unread && e.folder.includes('inbox')).length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-thb-text-secondary">Starred</span>
                  <span className="text-xs font-semibold text-amber-600">
                    {emails.filter((e) => e.starred).length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-thb-text-secondary">With Attachments</span>
                  <span className="text-xs font-semibold text-emerald-600">
                    {emails.filter((e) => e.hasAttachment && e.folder.includes('inbox')).length}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div
                    className="bg-green-500 h-1.5 rounded-full"
                    style={{
                      width: `${Math.round(
                        (emails.filter((e) => e.unread && e.folder.includes('inbox')).length /
                          Math.max(emails.filter((e) => e.folder.includes('inbox')).length, 1)) *
                          100
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-[10px] text-thb-text-muted">
                  {Math.round(
                    (emails.filter((e) => !e.unread && e.folder.includes('inbox')).length /
                      Math.max(emails.filter((e) => e.folder.includes('inbox')).length, 1)) *
                      100
                  )}
                  % inbox cleared
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Email List ─── */}
        <div
          className={`flex flex-col border-r border-thb-border bg-white ${
            selectedEmail ? 'w-96 shrink-0' : 'flex-1'
          }`}
        >
          {/* Search Bar */}
          <div className="p-3 border-b border-thb-border">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search emails..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-thb-border bg-slate-50 text-thb-text-primary placeholder:text-thb-text-muted focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-thb-text-muted hover:text-thb-text-primary"
                >
                  <FiX className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filteredEmails.length > 0 && selectedEmails.size === filteredEmails.length}
                  onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-green-500 focus:ring-green-500/20"
                />
              </label>
              {selectedEmails.size > 0 && (
                <div className="flex items-center gap-1 ml-2">
                  <span className="text-xs text-thb-text-muted font-medium">
                    {selectedEmails.size} selected
                  </span>
                  <button className="p-1.5 rounded hover:bg-slate-100 text-thb-text-muted hover:text-thb-text-primary transition-colors">
                    <FiArchive className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1.5 rounded hover:bg-slate-100 text-thb-text-muted hover:text-red-500 transition-colors">
                    <FiTrash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="flex-1" />
              <span className="text-xs text-thb-text-muted">
                {filteredEmails.length} email{filteredEmails.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Email Rows */}
          <div className="flex-1 overflow-y-auto">
            {filteredEmails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16">
                <FiInbox className="w-12 h-12 text-thb-text-muted mb-3" />
                <p className="text-sm text-thb-text-muted font-medium">No emails found</p>
                <p className="text-xs text-thb-text-muted mt-1">
                  {searchQuery ? 'Try a different search term' : 'This folder is empty'}
                </p>
              </div>
            ) : (
              filteredEmails.map((email) => {
                const isSelected = selectedEmailId === email.id;
                const isChecked = selectedEmails.has(email.id);
                return (
                  <div
                    key={email.id}
                    onClick={() => setSelectedEmailId(email.id)}
                    className={`flex items-start gap-2 px-3 py-3 cursor-pointer border-b border-slate-50 transition-colors group ${
                      isSelected
                        ? 'bg-green-50/70 border-l-2 border-l-green-500'
                        : email.unread
                        ? 'bg-green-50/30 border-l-2 border-l-green-400 hover:bg-slate-50'
                        : 'hover:bg-slate-50 border-l-2 border-l-transparent'
                    }`}
                  >
                    {/* Checkbox */}
                    <div
                      className="pt-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(email.id)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-green-500 focus:ring-green-500/20"
                      />
                    </div>

                    {/* Star */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStar(email.id);
                      }}
                      className="pt-0.5 shrink-0 transition-colors"
                    >
                      <FiStar
                        className={`w-4 h-4 ${
                          email.starred
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-300 hover:text-amber-300'
                        }`}
                      />
                    </button>

                    {/* Avatar */}
                    <div
                      className={`w-8 h-8 rounded-full ${getAvatarClass(
                        email.from.avatar
                      )} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}
                    >
                      {email.from.avatar === 'ME' ? 'ME' : getInitials(email.from.name)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm truncate ${
                            email.unread
                              ? 'font-semibold text-thb-text-primary'
                              : 'font-medium text-thb-text-secondary'
                          }`}
                        >
                          {email.from.name}
                        </span>
                        {email.label && (
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${email.labelColor}`}
                          >
                            {email.label}
                          </span>
                        )}
                        {email.hasAttachment && (
                          <FiPaperclip className="w-3.5 h-3.5 text-thb-text-muted shrink-0" />
                        )}
                      </div>
                      <p
                        className={`text-sm truncate mt-0.5 ${
                          email.unread
                            ? 'font-semibold text-thb-text-primary'
                            : 'text-thb-text-secondary'
                        }`}
                      >
                        {email.subject}
                      </p>
                      <p className="text-xs text-thb-text-muted truncate mt-0.5">
                        {email.preview}
                      </p>
                    </div>

                    {/* Date */}
                    <div className="shrink-0 text-right pt-0.5">
                      <span
                        className={`text-[11px] ${
                          email.unread
                            ? 'font-semibold text-green-500'
                            : 'text-thb-text-muted'
                        }`}
                      >
                        {email.date}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ─── Email Detail Panel ─── */}
        {selectedEmail ? (
          <div className="flex-1 flex flex-col bg-white overflow-hidden">
            {/* Detail Header */}
            <div className="p-4 border-b border-thb-border">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-full ${getAvatarClass(
                    selectedEmail.from.avatar
                  )} flex items-center justify-center text-white text-sm font-bold shrink-0`}
                >
                  {selectedEmail.from.avatar === 'ME'
                    ? 'ME'
                    : getInitials(selectedEmail.from.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-thb-text-primary">
                      {selectedEmail.from.name}
                    </h2>
                    <span className="text-xs text-thb-text-muted">
                      &lt;{selectedEmail.from.email}&gt;
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-thb-text-muted mt-0.5">
                    <span>To:</span>
                    {selectedEmail.to.map((t, i) => (
                      <span key={i}>
                        {t.name}
                        {i < selectedEmail.to.length - 1 ? ',' : ''}
                      </span>
                    ))}
                    {selectedEmail.cc && selectedEmail.cc.length > 0 && (
                      <>
                        <span className="ml-1">CC:</span>
                        {selectedEmail.cc.map((c, i) => (
                          <span key={i}>
                            {c.name}
                            {i < (selectedEmail.cc?.length ?? 0) - 1 ? ',' : ''}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-thb-text-muted">
                    {selectedEmail.date} · {selectedEmail.time}
                  </p>
                  {selectedEmail.label && (
                    <span
                      className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-1 ${selectedEmail.labelColor}`}
                    >
                      {selectedEmail.label}
                    </span>
                  )}
                </div>
              </div>

              {/* Subject */}
              <h1 className="text-lg font-bold text-thb-text-primary mt-3">
                {selectedEmail.subject}
              </h1>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-3">
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-thb-text-secondary bg-slate-50 hover:bg-slate-100 border border-thb-border transition-colors">
                  <FiCornerUpLeft className="w-3.5 h-3.5" />
                  Reply
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-thb-text-secondary bg-slate-50 hover:bg-slate-100 border border-thb-border transition-colors">
                  <FiCornerUpRight className="w-3.5 h-3.5" />
                  Forward
                </button>
                <button className="p-1.5 rounded-lg text-thb-text-muted hover:bg-slate-100 hover:text-thb-text-primary transition-colors">
                  <FiArchive className="w-4 h-4" />
                </button>
                <button className="p-1.5 rounded-lg text-thb-text-muted hover:bg-slate-100 hover:text-thb-text-primary transition-colors">
                  <FiTrash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    toggleStar(selectedEmail.id);
                  }}
                  className="p-1.5 rounded-lg transition-colors"
                >
                  <FiStar
                    className={`w-4 h-4 ${
                      selectedEmail.starred
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-thb-text-muted hover:text-amber-300'
                    }`}
                  />
                </button>
                <div className="flex-1" />
                <button className="p-1.5 rounded-lg text-thb-text-muted hover:bg-slate-100 hover:text-thb-text-primary transition-colors">
                  <FiMoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Email Body */}
            <div className="flex-1 overflow-y-auto p-5">
              <div className="prose prose-sm max-w-none text-thb-text-secondary">
                {selectedEmail.body.split('\n').map((line, i) => {
                  if (line.startsWith('•') || line.startsWith('-')) {
                    return (
                      <div key={i} className="flex gap-2 ml-2">
                        <span className="text-thb-text-muted shrink-0">•</span>
                        <span>{line.replace(/^[•-]\s*/, '')}</span>
                      </div>
                    );
                  }
                  if (line.trim() === '') return <div key={i} className="h-2" />;
                  if (line.match(/^\d+\./)) {
                    return (
                      <div key={i} className="flex gap-2 ml-2">
                        <span className="text-green-500 font-medium shrink-0">
                          {line.match(/^\d+/)?.[0]}.
                        </span>
                        <span>{line.replace(/^\d+\.\s*/, '')}</span>
                      </div>
                    );
                  }
                  return <p key={i} className="mb-1 leading-relaxed">{line}</p>;
                })}
              </div>

              {/* Attachments */}
              {selectedEmail.hasAttachment && selectedEmail.attachments && (
                <div className="mt-6 pt-4 border-t border-thb-border">
                  <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                    <FiPaperclip className="w-3.5 h-3.5" />
                    Attachments ({selectedEmail.attachments.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedEmail.attachments.map((att, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-thb-border bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group"
                      >
                        {getFileIcon(att.type)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-thb-text-primary truncate group-hover:text-green-600 transition-colors">
                            {att.name}
                          </p>
                          <p className="text-[11px] text-thb-text-muted">{att.size}</p>
                        </div>
                        <button className="p-1.5 rounded-lg text-thb-text-muted hover:bg-white hover:text-green-500 transition-colors">
                          <FiChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Reply */}
            <div className="p-4 border-t border-thb-border bg-slate-50/50">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                  ME
                </div>
                <div className="flex-1">
                  <textarea
                    placeholder="Write a quick reply..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-thb-border bg-white text-thb-text-primary placeholder:text-thb-text-muted focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 resize-none transition-all"
                    rows={2}
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-white shadow-sm hover:shadow-md transition-all"
                      style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}
                    >
                      Send Reply
                    </button>
                    <button className="px-3 py-1.5 rounded-lg text-xs font-medium text-thb-text-secondary bg-white border border-thb-border hover:bg-slate-50 transition-colors">
                      Save Draft
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Empty Detail State */
          <div className="flex-1 flex flex-col items-center justify-center bg-white">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <FiMail className="w-8 h-8 text-thb-text-muted" />
              </div>
              <h3 className="text-lg font-semibold text-thb-text-primary mb-1">
                Select an email
              </h3>
              <p className="text-sm text-thb-text-muted max-w-xs">
                Choose an email from the list to view its contents
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Compose Modal ─── */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-6">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 animate-fade-in"
            onClick={() => setShowCompose(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-thb-border animate-slide-in-up flex flex-col" style={{ maxHeight: 'calc(100vh - 120px)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-thb-border rounded-t-xl" style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}>
              <h3 className="text-sm font-semibold text-white">New Message</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowCompose(false)}
                  className="p-1 rounded hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Form Fields */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="border-b border-slate-100">
                <div className="flex items-center px-4 py-2 gap-2">
                  <span className="text-xs font-medium text-thb-text-muted w-8">To</span>
                  <input
                    type="text"
                    value={composeTo}
                    onChange={(e) => setComposeTo(e.target.value)}
                    placeholder="recipient@3boxes.com"
                    className="flex-1 text-sm text-thb-text-primary placeholder:text-thb-text-muted bg-transparent focus:outline-none"
                  />
                </div>
              </div>
              <div className="border-b border-slate-100">
                <div className="flex items-center px-4 py-2 gap-2">
                  <span className="text-xs font-medium text-thb-text-muted w-8">CC</span>
                  <input
                    type="text"
                    value={composeCC}
                    onChange={(e) => setComposeCC(e.target.value)}
                    placeholder="cc@3boxes.com (optional)"
                    className="flex-1 text-sm text-thb-text-primary placeholder:text-thb-text-muted bg-transparent focus:outline-none"
                  />
                </div>
              </div>
              <div className="border-b border-thb-border">
                <div className="flex items-center px-4 py-2.5 gap-2">
                  <span className="text-xs font-medium text-thb-text-muted w-14">Subject</span>
                  <input
                    type="text"
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    placeholder="Email subject"
                    className="flex-1 text-sm font-medium text-thb-text-primary placeholder:text-thb-text-muted bg-transparent focus:outline-none"
                  />
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-hidden">
                <textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Write your message here..."
                  className="w-full h-full px-4 py-3 text-sm text-thb-text-secondary placeholder:text-thb-text-muted bg-transparent focus:outline-none resize-none leading-relaxed"
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-thb-border bg-slate-50/50 rounded-b-xl">
              <div className="flex items-center gap-2">
                <button className="p-2 rounded-lg text-thb-text-muted hover:bg-slate-100 hover:text-thb-text-primary transition-colors">
                  <FiPaperclip className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowCompose(false);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-thb-text-secondary bg-white border border-thb-border hover:bg-slate-50 transition-colors"
                >
                  Save Draft
                </button>
                <button
                  onClick={handleSend}
                  className="px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all"
                  style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}
                >
                  <span className="flex items-center gap-2">
                    <FiSend className="w-3.5 h-3.5" />
                    Send
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
