/**
 * 3Boxes HRMS User Manual / SOP — Leave, Attendance, Employee Modules
 * Generated via ReportLab (Report brief)
 * 
 * Target: End Users (employees + managers)
 * Style: Corporate (green/emerald, Inter/Noto Sans)
 * Length: Standard (~25-35 pages)
 * Includes: Workflow diagrams (text-based flow representations)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Write the Python ReportLab script
const script = `#!/usr/bin/env python3
"""3Boxes HRMS User Manual / SOP — Leave, Attendance, Employee Modules.
Corporate style, end-user audience, ~30 pages with workflow diagrams.
"""
import os
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, ListFlowable, ListItem, HRFlowable, Image
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.lib import colors

# ─── Font Registration ───
FONT_DIR = '/usr/share/fonts'
try:
    pdfmetrics.registerFont(TTFont('NotoSans', f'{FONT_DIR}/truetype/chinese/NotoSansSC-Regular.ttf'))
    pdfmetrics.registerFont(TTFont('NotoSans-Bold', f'{FONT_DIR}/truetype/chinese/NotoSansSC-Bold.ttf'))
    registerFontFamily('NotoSans', normal='NotoSans', bold='NotoSans-Bold')
    BODY_FONT = 'NotoSans'
    BOLD_FONT = 'NotoSans-Bold'
except:
    BODY_FONT = 'Helvetica'
    BOLD_FONT = 'Helvetica-Bold'

# ─── Brand Colors ───
GREEN = HexColor('#10b981')
DARK_GREEN = HexColor('#065f46')
LIGHT_GREEN = HexColor('#d1fae5')
SLATE = HexColor('#334155')
LIGHT_SLATE = HexColor('#64748b')
WHITE = HexColor('#ffffff')
BG_LIGHT = HexColor('#f8fafc')
AMBER = HexColor('#f59e0b')
ROSE = HexColor('#ef4444')
TEAL = HexColor('#14b8a6')
BORDER = HexColor('#e2e8f0')

# ─── Styles ───
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='CoverTitle', fontName=BOLD_FONT, fontSize=28, textColor=WHITE, alignment=TA_CENTER, spaceAfter=8, leading=36))
styles.add(ParagraphStyle(name='CoverSubtitle', fontName=BODY_FONT, fontSize=14, textColor=HexColor('#a7f3d0'), alignment=TA_CENTER, spaceAfter=4, leading=20))
styles.add(ParagraphStyle(name='H1', fontName=BOLD_FONT, fontSize=20, textColor=DARK_GREEN, spaceBefore=20, spaceAfter=10, leading=26))
styles.add(ParagraphStyle(name='H2', fontName=BOLD_FONT, fontSize=15, textColor=GREEN, spaceBefore=14, spaceAfter=8, leading=20))
styles.add(ParagraphStyle(name='H3', fontName=BOLD_FONT, fontSize=12, textColor=SLATE, spaceBefore=10, spaceAfter=6, leading=16))
styles.add(ParagraphStyle(name='Body', fontName=BODY_FONT, fontSize=10, textColor=SLATE, spaceBefore=4, spaceAfter=6, leading=15, alignment=TA_JUSTIFY))
styles.add(ParagraphStyle(name='MyBullet', fontName=BODY_FONT, fontSize=10, textColor=SLATE, leftIndent=20, spaceBefore=2, spaceAfter=2, leading=14))
styles.add(ParagraphStyle(name='MyStep', fontName=BODY_FONT, fontSize=10, textColor=SLATE, leftIndent=24, spaceBefore=3, spaceAfter=3, leading=14))
styles.add(ParagraphStyle(name='MyTip', fontName=BODY_FONT, fontSize=9, textColor=HexColor('#92400e'), backColor=HexColor('#fef3c7'), borderPadding=8, leftIndent=8, rightIndent=8, spaceBefore=6, spaceAfter=6, leading=13))
styles.add(ParagraphStyle(name='MyFlow', fontName=BODY_FONT, fontSize=10, textColor=SLATE, leftIndent=16, spaceBefore=3, spaceAfter=3, leading=15, backColor=BG_LIGHT, borderPadding=6))
styles.add(ParagraphStyle(name='TableHeader', fontName=BOLD_FONT, fontSize=9, textColor=WHITE, alignment=TA_CENTER, leading=12))
styles.add(ParagraphStyle(name='TableCell', fontName=BODY_FONT, fontSize=9, textColor=SLATE, leading=12))
styles.add(ParagraphStyle(name='MyFooter', fontName=BODY_FONT, fontSize=8, textColor=LIGHT_SLATE, alignment=TA_CENTER))

PAGE_W, PAGE_H = A4
LEFT_M = 20*mm
RIGHT_M = 20*mm
TOP_M = 25*mm
BOTTOM_M = 20*mm
CONTENT_W = PAGE_W - LEFT_M - RIGHT_M


def header_footer(canvas, doc):
    canvas.saveState()
    # Footer
    canvas.setFont(BODY_FONT, 8)
    canvas.setFillColor(LIGHT_SLATE)
    canvas.drawCentredString(PAGE_W/2, 12*mm, f'3Boxes HRMS User Manual  |  Page {doc.page}')
    # Header line
    canvas.setStrokeColor(GREEN)
    canvas.setLineWidth(2)
    canvas.line(LEFT_M, PAGE_H - 15*mm, PAGE_W - RIGHT_M, PAGE_H - 15*mm)
    canvas.restoreState()

def cover_page(canvas, doc):
    canvas.saveState()
    # Full-page green gradient background
    canvas.setFillColor(DARK_GREEN)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1)
    # Decorative accent line
    canvas.setStrokeColor(GREEN)
    canvas.setLineWidth(4)
    canvas.line(LEFT_M, PAGE_H - 60*mm, PAGE_W - RIGHT_M, PAGE_H - 60*mm)
    # Title
    canvas.setFont(BOLD_FONT, 32)
    canvas.setFillColor(white)
    canvas.drawCentredString(PAGE_W/2, PAGE_H - 80*mm, '3Boxes HRMS')
    canvas.setFont(BOLD_FONT, 22)
    canvas.drawCentredString(PAGE_W/2, PAGE_H - 95*mm, 'User Manual & SOP')
    canvas.setFont(BODY_FONT, 12)
    canvas.setFillColor(HexColor('#a7f3d0'))
    canvas.drawCentredString(PAGE_W/2, PAGE_H - 110*mm, 'Leave | Attendance | Employee Modules')
    canvas.drawCentredString(PAGE_W/2, PAGE_H - 122*mm, 'End-User Guide with Workflow Explanations')
    # Bottom branding
    canvas.setFont(BODY_FONT, 9)
    canvas.setFillColor(HexColor('#6ee7b7'))
    canvas.drawCentredString(PAGE_W/2, 30*mm, '3Boxes HRMS  |  People  |  Process  |  Technology')
    canvas.drawCentredString(PAGE_W/2, 22*mm, 'Document Version 1.0')
    canvas.restoreState()

# ─── Build Story ───
story = []

# Cover (handled by cover_page callback — add a dummy spacer)
story.append(Spacer(1, 1))
story.append(PageBreak())

# (TOC removed for simplicity — chapters are clearly numbered)

# ══════════════════════════════════════════════════════════════════
# CHAPTER 1: INTRODUCTION
# ══════════════════════════════════════════════════════════════════
story.append(Paragraph('Chapter 1: Introduction', styles['H1']))

story.append(Paragraph('1.1 About This Manual', styles['H2']))
story.append(Paragraph(
    'This User Manual and Standard Operating Procedure (SOP) document provides comprehensive guidance for end-users of the 3Boxes HRMS platform. It covers three core modules: Leave Management, Attendance Management, and Employee Self-Service. Each section includes step-by-step instructions, workflow explanations, and best practices to help you navigate the system efficiently. Whether you are an employee applying for leave, a manager approving requests, or an HR administrator configuring policies, this manual will walk you through every process with clear, actionable instructions.',
    styles['Body']))

story.append(Paragraph('1.2 How to Login', styles['H2']))
story.append(Paragraph(
    'You can log in to 3Boxes HRMS using either your official email address OR your Employee ID. The login page accepts both formats in the same field. Enter your credentials on the login screen and click "Sign In". If you forget your password, click the "Forgot password?" link below the password field to receive a password reset link via email. The reset link is valid for 30 minutes.',
    styles['Body']))

story.append(Paragraph(
    '<b>Login Options:</b><br/>'
    '1. <b>Email Login:</b> Enter your official company email (e.g., john@company.com) and password.<br/>'
    '2. <b>Employee ID Login:</b> Enter your Employee ID (e.g., EMP001) and password.<br/>'
    '3. <b>Forgot Password:</b> Click "Forgot password?" to receive a reset link via email.',
    styles['MyFlow']))

story.append(Paragraph('1.3 Navigation Overview', styles['H2']))
story.append(Paragraph(
    'After logging in, you will see the main dashboard with a collapsible sidebar on the left. The sidebar is organized by module: Leave, Attendance, Employee, and more. Click on any module to expand its sub-menu and access specific pages. The top bar contains a notification bell (showing unread notification count), a search bar, a company switcher, and a user menu with logout option.',
    styles['Body']))

story.append(Paragraph('1.4 Notification Bell', styles['H2']))
story.append(Paragraph(
    'The notification bell icon in the top bar displays a live count of unread notifications. The count updates automatically every 30 seconds. Click the bell to see a dropdown list of recent notifications including leave approvals, attendance alerts, and system messages. Click "Mark all as read" to clear the badge.',
    styles['Body']))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════
# CHAPTER 2: LEAVE MODULE
# ══════════════════════════════════════════════════════════════════
story.append(Paragraph('Chapter 2: Leave Module', styles['H1']))

story.append(Paragraph('2.1 Module Overview', styles['H2']))
story.append(Paragraph(
    'The Leave Module handles all aspects of leave management including leave applications, approvals, balance tracking, and encashment. Employees can apply for various leave types (Casual, Sick, Earned, Maternity, etc.), check their leave balance, and track the status of their applications. Managers and HR admins can view pending approvals, approve or reject requests, and configure leave policies. The module supports multi-tier approval workflows, half-day leaves, sandwich rules, and carry-forward policies.',
    styles['Body']))

story.append(Paragraph('2.2 How to Apply for Leave', styles['H2']))
story.append(Paragraph(
    'To apply for leave, navigate to the Leave module in the sidebar and click "Apply Leave". This will open the Leave Dashboard with the Apply Leave form automatically expanded. Fill in the required fields: leave type, start date, end date, reason, and whether it is a half-day leave. The system will automatically calculate the number of working days (excluding weekends and holidays) and show your remaining leave balance.',
    styles['Body']))

story.append(Paragraph(
    '<b>Steps to Apply for Leave:</b><br/>'
    '1. Click "Apply Leave" in the sidebar (or "Add Leave" on the Leave Dashboard).<br/>'
    '2. Select the <b>Leave Type</b> from the dropdown (e.g., Casual Leave, Sick Leave).<br/>'
    '3. Choose the <b>From Date</b> and <b>To Date</b> using the date pickers.<br/>'
    '4. If applicable, tick the <b>Half Day</b> checkbox and select First Half or Second Half.<br/>'
    '5. Enter a <b>Reason</b> for your leave (minimum 3 characters).<br/>'
    '6. Check the <b>Approver Chain Preview</b> to see who will approve your request.<br/>'
    '7. Click <b>Submit</b> to send the request to your reporting manager.<br/>'
    '8. You will see a success toast: "Leave request submitted successfully".',
    styles['MyFlow']))

story.append(Paragraph(
    '<b>Tip:</b> The system shows a live "Approval Chain" card below the form. It displays the name and email of each approver in the chain (Tier 1: Reporting Manager, Tier 2: HR Admin) so you know exactly who will review your request before you submit.',
    styles['MyTip']))

story.append(Paragraph('2.3 Leave Application Workflow', styles['H2']))
story.append(Paragraph(
    'When you submit a leave application, the system routes it through a multi-tier approval workflow. The standard workflow has two tiers: Tier 1 (Reporting Manager) and Tier 2 (HR Admin). Your request goes to the Tier 1 approver first. Once they approve, it automatically advances to Tier 2. After Tier 2 approves, the leave is finalized, your leave balance is deducted, and the corresponding dates are marked as "on_leave" in your attendance record.',
    styles['Body']))

story.append(Paragraph(
    '<b>Leave Approval Workflow:</b><br/>'
    '<br/>'
    '&nbsp;&nbsp;Employee Applies<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;v<br/>'
    '&nbsp;&nbsp;Tier 1: Reporting Manager<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;|-- Approve --> Advance to Tier 2<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;|-- Reject --> Employee notified, workflow ends<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;v<br/>'
    '&nbsp;&nbsp;Tier 2: HR Admin<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;|-- Approve --> Leave FINALIZED (balance deducted, attendance updated)<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;|-- Reject --> Employee notified, workflow ends<br/>'
    '<br/>'
    '&nbsp;&nbsp;At each tier, the employee receives an email notification:<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;- Tier 1 approved: "Approved by [Manager Name], waiting at [HR Admin Name]"<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;- Tier 2 approved: "Your [Leave Type] leave was approved"<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;- Rejected: "Your [Leave Type] leave request was rejected"',
    styles['MyFlow']))

story.append(Paragraph('2.4 Viewing Your Leave Applications', styles['H2']))
story.append(Paragraph(
    'To view your leave applications, click "My Leave Applications" in the sidebar. This page shows only YOUR applications (not other employees) with their current status: Pending, Approved, or Rejected. You can also see the approval history for each request, including which tier approved it and when. The page also displays your current leave balance for each leave type.',
    styles['Body']))

story.append(Paragraph(
    '<b>Status Meanings:</b><br/>'
    '- <b>Pending:</b> Your request is awaiting approval at one of the tiers.<br/>'
    '- <b>Approved:</b> All tiers have approved. Leave balance has been deducted.<br/>'
    '- <b>Rejected:</b> The request was rejected at one of the tiers. No balance change.<br/>'
    '- <b>Cancelled:</b> You cancelled the request before it was approved.',
    styles['MyFlow']))

story.append(Paragraph('2.5 Leave Balance', styles['H2']))
story.append(Paragraph(
    'Your leave balance is displayed on the Leave Dashboard and the "My Leave Balance" page. It shows the total allocated days, used days, and remaining days for each leave type. When a leave is approved, the used days increase and remaining days decrease automatically. When a leave is rejected or cancelled, no balance change occurs. At year-end, carry-forward rules apply: unused Casual Leave typically lapses, while Earned Leave may be carried forward (up to a configured maximum) or encashed.',
    styles['Body']))

story.append(Paragraph('2.6 Leave Encashment', styles['H2']))
story.append(Paragraph(
    'If your organization allows leave encashment, you can request to convert your unused leave balance to a payout. Navigate to Leave > Leave Encashment, select the leave type, enter the number of days to encash, and submit. The request goes through an approval workflow similar to leave applications. Once approved, the encashment amount is calculated based on your basic salary and forwarded to payroll for processing.',
    styles['Body']))

story.append(Paragraph('2.7 Leave Types', styles['H2']))
leave_types_data = [
    [Paragraph('<b>Leave Type</b>', styles['TableHeader']), Paragraph('<b>Nature</b>', styles['TableHeader']), Paragraph('<b>Typical Allocation</b>', styles['TableHeader']), Paragraph('<b>Notes</b>', styles['TableHeader'])],
    [Paragraph('Casual Leave (CL)', styles['TableCell']), Paragraph('Paid', styles['TableCell']), Paragraph('8-12 days/year', styles['TableCell']), Paragraph('Short-duration, usually lapses at year-end', styles['TableCell'])],
    [Paragraph('Sick Leave (SL)', styles['TableCell']), Paragraph('Paid', styles['TableCell']), Paragraph('6-12 days/year', styles['TableCell']), Paragraph('May require medical certificate >3 days', styles['TableCell'])],
    [Paragraph('Earned Leave (EL/PL)', styles['TableCell']), Paragraph('Paid', styles['TableCell']), Paragraph('15-30 days/year', styles['TableCell']), Paragraph('Can carry forward or encash', styles['TableCell'])],
    [Paragraph('Loss of Pay (LOP)', styles['TableCell']), Paragraph('Unpaid', styles['TableCell']), Paragraph('No limit', styles['TableCell']), Paragraph('Salary deducted for LOP days', styles['TableCell'])],
    [Paragraph('Maternity Leave', styles['TableCell']), Paragraph('Paid', styles['TableCell']), Paragraph('182 days', styles['TableCell']), Paragraph('Restricted to female employees', styles['TableCell'])],
    [Paragraph('Paternity Leave', styles['TableCell']), Paragraph('Paid', styles['TableCell']), Paragraph('15 days', styles['TableCell']), Paragraph('Restricted to male employees', styles['TableCell'])],
    [Paragraph('Marriage Leave', styles['TableCell']), Paragraph('Paid', styles['TableCell']), Paragraph('3-5 days', styles['TableCell']), Paragraph('One-time per employment', styles['TableCell'])],
    [Paragraph('Compassionate Leave', styles['TableCell']), Paragraph('Paid', styles['TableCell']), Paragraph('3 days/event', styles['TableCell']), Paragraph('Bereavement or family emergency', styles['TableCell'])],
]
t = Table(leave_types_data, colWidths=[CONTENT_W*0.22, CONTENT_W*0.12, CONTENT_W*0.22, CONTENT_W*0.44])
t.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), GREEN),
    ('TEXTCOLOR', (0,0), (-1,0), white),
    ('ALIGN', (0,0), (-1,0), 'CENTER'),
    ('FONTNAME', (0,0), (-1,0), BOLD_FONT),
    ('FONTSIZE', (0,0), (-1,-1), 9),
    ('BOTTOMPADDING', (0,0), (-1,0), 8),
    ('TOPPADDING', (0,0), (-1,0), 8),
    ('BACKGROUND', (0,1), (-1,-1), BG_LIGHT),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, BG_LIGHT]),
    ('GRID', (0,0), (-1,-1), 0.5, BORDER),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('LEFTPADDING', (0,0), (-1,-1), 6),
    ('RIGHTPADDING', (0,0), (-1,-1), 6),
]))
story.append(t)

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════
# CHAPTER 3: ATTENDANCE MODULE
# ══════════════════════════════════════════════════════════════════
story.append(Paragraph('Chapter 3: Attendance Module', styles['H1']))

story.append(Paragraph('3.1 Module Overview', styles['H2']))
story.append(Paragraph(
    'The Attendance Module handles daily time tracking including check-in/check-out, break management, regularization, and various self-service requests like WFH, Gate Pass, Hourly Permission, Overtime, and Comp-Off. The system automatically captures GPS location on every punch action (check-in, check-out, break-in, break-out) and stores it for compliance reporting. Employees can view their attendance calendar, apply for regularization of missed punches, and track their work hours, overtime, and break time.',
    styles['Body']))

story.append(Paragraph('3.2 Check In / Check Out', styles['H2']))
story.append(Paragraph(
    'To mark your attendance, navigate to the Attendance Dashboard. You will see two large buttons: "Check In" (green) and "Check Out" (red). Click "Check In" when you start your workday. The system will automatically capture your GPS location (you may be prompted by your browser to grant location permission). A success toast will display your check-in time and GPS coordinates (or area name if reverse-geocoding is available). Click "Check Out" at the end of your workday. The system calculates your total work hours, break minutes, and overtime automatically.',
    styles['Body']))

story.append(Paragraph(
    '<b>Attendance Punch Workflow:</b><br/>'
    '<br/>'
    '&nbsp;&nbsp;1. Employee clicks "Check In"<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;--> GPS captured (lat, lng, accuracy, area name)<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;--> Status = Present<br/>'
    '&nbsp;&nbsp;2. Employee clicks "Break In" (optional - for lunch/tea break)<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;--> GPS captured<br/>'
    '&nbsp;&nbsp;3. Employee clicks "Break Out" (end break)<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;--> GPS captured<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;--> Break minutes = Break Out - Break In<br/>'
    '&nbsp;&nbsp;4. Employee clicks "Check Out"<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;--> GPS captured<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;--> Work Hours = Check Out - Check In - Break Minutes<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;--> Overtime = max(0, Work Hours - Standard Shift Hours)',
    styles['MyFlow']))

story.append(Paragraph('3.3 Break In / Break Out', styles['H2']))
story.append(Paragraph(
    'Break buttons (amber "Break In" and teal "Break Out") appear between Check In and Check Out. Use these to track your lunch or tea breaks. When you click "Break In", the system records the start of your break. When you click "Break Out", the system records the end. The total break duration is automatically subtracted from your total span to calculate your actual work hours. Break time is shown on the Punch Activity Log report with GPS coordinates for each action.',
    styles['Body']))

story.append(Paragraph(
    '<b>Tip:</b> If you forget to click Break Out, your work hours will appear inflated. You can submit a regularization request to correct the punch time.',
    styles['MyTip']))

story.append(Paragraph('3.4 Attendance Self-Service Requests', styles['H2']))
story.append(Paragraph(
    'The Attendance module offers several self-service request types that employees can submit. Each request type goes through an approval workflow (typically Reporting Manager then HR Admin). Below is a summary of each request type and its purpose.',
    styles['Body']))

req_data = [
    [Paragraph('<b>Request Type</b>', styles['TableHeader']), Paragraph('<b>Purpose</b>', styles['TableHeader']), Paragraph('<b>Approval</b>', styles['TableHeader'])],
    [Paragraph('Regularization', styles['TableCell']), Paragraph('Correct missed punches, fix check-in/out times', styles['TableCell']), Paragraph('Manager + HR', styles['TableCell'])],
    [Paragraph('WFH (Work From Home)', styles['TableCell']), Paragraph('Request to work from home for a date range', styles['TableCell']), Paragraph('Manager + HOD (if >2 days/week)', styles['TableCell'])],
    [Paragraph('Hourly Permission', styles['TableCell']), Paragraph('Short leave (2-4 hours) with auto-approval for low-risk', styles['TableCell']), Paragraph('Manager (24h auto-approve)', styles['TableCell'])],
    [Paragraph('Gate Pass', styles['TableCell']), Paragraph('Permission to leave office premises during work hours', styles['TableCell']), Paragraph('Manager + HR (skip for official)', styles['TableCell'])],
    [Paragraph('Overtime Request', styles['TableCell']), Paragraph('Request OT hours with payout or comp-off preference', styles['TableCell']), Paragraph('Manager + HR', styles['TableCell'])],
    [Paragraph('Comp-Off Balance', styles['TableCell']), Paragraph('View comp-off earned from OT, apply leave against comp-off', styles['TableCell']), Paragraph('N/A (balance view)', styles['TableCell'])],
]
t2 = Table(req_data, colWidths=[CONTENT_W*0.22, CONTENT_W*0.50, CONTENT_W*0.28])
t2.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), TEAL),
    ('TEXTCOLOR', (0,0), (-1,0), white),
    ('ALIGN', (0,0), (-1,0), 'CENTER'),
    ('FONTNAME', (0,0), (-1,0), BOLD_FONT),
    ('FONTSIZE', (0,0), (-1,-1), 9),
    ('BOTTOMPADDING', (0,0), (-1,0), 8),
    ('TOPPADDING', (0,0), (-1,0), 8),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, BG_LIGHT]),
    ('GRID', (0,0), (-1,-1), 0.5, BORDER),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('LEFTPADDING', (0,0), (-1,-1), 6),
    ('RIGHTPADDING', (0,0), (-1,-1), 6),
]))
story.append(t2)

story.append(Paragraph('3.5 How to Apply for Regularization', styles['H2']))
story.append(Paragraph(
    'If you missed a punch (forgot to check-in or check-out), you can submit a regularization request. Navigate to Attendance > Apply Regularization. Select the date, punch type (Check In / Check Out), enter the correct time using the AM/PM time picker, and provide a reason (minimum 3 characters). The system checks for duplicate regularization requests for the same date and punch type. Once approved, the attendance record is updated with the corrected time.',
    styles['Body']))

story.append(Paragraph(
    '<b>Regularization Workflow:</b><br/>'
    '&nbsp;&nbsp;1. Employee submits regularization with corrected time + reason.<br/>'
    '&nbsp;&nbsp;2. Request goes to Reporting Manager for approval.<br/>'
    '&nbsp;&nbsp;3. If approved, advances to HR Admin for final approval.<br/>'
    '&nbsp;&nbsp;4. After HR approval, the attendance record is updated with the corrected time.<br/>'
    '&nbsp;&nbsp;5. Employee + HR receive in-app notifications at each stage.',
    styles['MyFlow']))

story.append(Paragraph('3.6 Attendance Calendar & Statuses', styles['H2']))
story.append(Paragraph(
    'The Attendance Dashboard displays a calendar view with color-coded statuses for each day. The system automatically derives statuses for days without punches: weekends (configurable, typically Saturday + Sunday), holidays (from the Holiday Calendar), and approved leave dates. For working days without a punch, the system marks the day as "Absent" (for past dates only).',
    styles['Body']))

status_data = [
    [Paragraph('<b>Status</b>', styles['TableHeader']), Paragraph('<b>Color</b>', styles['TableHeader']), Paragraph('<b>Meaning</b>', styles['TableHeader'])],
    [Paragraph('Present', styles['TableCell']), Paragraph('Green', styles['TableCell']), Paragraph('Checked in on time (before shift start + grace period)', styles['TableCell'])],
    [Paragraph('Present (Late)', styles['TableCell']), Paragraph('Amber', styles['TableCell']), Paragraph('Checked in after shift start + grace period. Shows "Late by N mins".', styles['TableCell'])],
    [Paragraph('Absent', styles['TableCell']), Paragraph('Red', styles['TableCell']), Paragraph('No check-in recorded for a past working day (not on leave)', styles['TableCell'])],
    [Paragraph('On Leave', styles['TableCell']), Paragraph('Blue', styles['TableCell']), Paragraph('Approved leave covers this date', styles['TableCell'])],
    [Paragraph('Weekend', styles['TableCell']), Paragraph('Gray', styles['TableCell']), Paragraph('Non-working day (Saturday/Sunday, configurable)', styles['TableCell'])],
    [Paragraph('Holiday', styles['TableCell']), Paragraph('Teal', styles['TableCell']), Paragraph('Public holiday from the Holiday Calendar', styles['TableCell'])],
    [Paragraph('WFH', styles['TableCell']), Paragraph('Teal', styles['TableCell']), Paragraph('Approved Work From Home for this date', styles['TableCell'])],
    [Paragraph('Half Day', styles['TableCell']), Paragraph('Orange', styles['TableCell']), Paragraph('Half-day leave or less than standard work hours', styles['TableCell'])],
]
t3 = Table(status_data, colWidths=[CONTENT_W*0.18, CONTENT_W*0.12, CONTENT_W*0.70])
t3.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), SLATE),
    ('TEXTCOLOR', (0,0), (-1,0), white),
    ('ALIGN', (0,0), (-1,0), 'CENTER'),
    ('FONTNAME', (0,0), (-1,0), BOLD_FONT),
    ('FONTSIZE', (0,0), (-1,-1), 9),
    ('BOTTOMPADDING', (0,0), (-1,0), 8),
    ('TOPPADDING', (0,0), (-1,0), 8),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, BG_LIGHT]),
    ('GRID', (0,0), (-1,-1), 0.5, BORDER),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('LEFTPADDING', (0,0), (-1,-1), 6),
    ('RIGHTPADDING', (0,0), (-1,-1), 6),
]))
story.append(t3)

story.append(Paragraph('3.7 Punch Activity Log Report', styles['H2']))
story.append(Paragraph(
    'The Punch Activity Log report (Attendance > Reports > Punch Activity Log) shows a detailed audit trail of every punch event. It has two views: Event Log (every individual check-in, check-out, break-in, break-out with GPS area name, timestamp, and method) and Daily Summary (per-employee per-day aggregation with work hours, break minutes, overtime, and location). You can filter by date range and export to CSV. The GPS location shows the reverse-geocoded area name (e.g., "Koramangala, Bengaluru, India") instead of raw coordinates.',
    styles['Body']))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════
# CHAPTER 4: EMPLOYEE MODULE
# ══════════════════════════════════════════════════════════════════
story.append(Paragraph('Chapter 4: Employee Module', styles['H1']))

story.append(Paragraph('4.1 Module Overview', styles['H2']))
story.append(Paragraph(
    'The Employee Module provides self-service capabilities for employees to view and update their personal information, track their employment lifecycle (probation, confirmation, transfer, resignation), and access important documents. Employees can edit personal details (phone, address, personal email, emergency contact) directly. Changes to high-risk fields (name, date of birth, bank details, KYC documents, employment details like department/designation) require HR admin approval before they take effect. Official email, employee ID, salary, and joining date are restricted and can only be changed by admins.',
    styles['Body']))

story.append(Paragraph('4.2 Employee Self-Service: Profile Editing', styles['H2']))
story.append(Paragraph(
    'Employees can edit their own profile information. Navigate to Employee > My Profile. The profile form shows your personal details, contact information, employment details, and bank/KYC information. Fields are classified by sensitivity level which determines the approval requirement.',
    styles['Body']))

story.append(Paragraph(
    '<b>Field Sensitivity Classification:</b><br/>'
    '<br/>'
    '&nbsp;&nbsp;<b>LOW sensitivity (direct update, no approval needed):</b><br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;Phone Number, Address, City, State, ZIP Code, Country,<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;Emergency Contact Name, Emergency Contact Phone, Personal Email<br/>'
    '<br/>'
    '&nbsp;&nbsp;<b>HIGH sensitivity (requires HR approval before changes take effect):</b><br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;First Name, Last Name, Date of Birth, Gender, Marital Status, Nationality,<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;Department, Designation, Branch, Reporting Manager,<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;Employee Type, Employee Status,<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;Bank Name, Bank Account Number, Bank IFSC Code,<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;PAN Number, Aadhaar Number, Tax ID<br/>'
    '<br/>'
    '&nbsp;&nbsp;<b>RESTRICTED (employee can NEVER change; admin only):</b><br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;Official Email, Employee ID, User ID, Salary, Salary Currency,<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;Salary Structure, Date of Joining, Employee Status, Company',
    styles['MyFlow']))

story.append(Paragraph(
    '<b>Important:</b> When you submit a change to a HIGH sensitivity field, the updated data is NOT visible immediately. The change goes to the HR admin approval queue. Only after HR approves the change does the updated data appear in your profile and across the system. Until then, the old value remains.',
    styles['MyTip']))

story.append(Paragraph('4.3 Employee Edit Log', styles['H2']))
story.append(Paragraph(
    'The Employee Edit Log (Employee > Edit Log) shows a complete audit trail of all profile-change requests. Employees see their own requests; admins see all employees requests. Each entry shows: the employee, the field changed, the old value vs new value, the reason for the change, the approval status (Pending / Approved / Rejected), the requested date, and the reviewed date. You can filter by status and category, and export to CSV for compliance reporting.',
    styles['Body']))

story.append(Paragraph(
    '<b>Edit Log Workflow:</b><br/>'
    '<br/>'
    '&nbsp;&nbsp;1. Employee edits a HIGH sensitivity field (e.g., bank account number).<br/>'
    '&nbsp;&nbsp;2. System creates an Update Request (status = Pending).<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;The Employee record is NOT updated yet.<br/>'
    '&nbsp;&nbsp;3. HR Admin reviews the request in the Update Requests queue.<br/>'
    '&nbsp;&nbsp;4. HR Admin approves or rejects.<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;If approved: Employee record updated, status = Applied.<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;If rejected: No change, status = Rejected.<br/>'
    '&nbsp;&nbsp;5. Entry appears in the Edit Log with full audit trail.',
    styles['MyFlow']))

story.append(Paragraph('4.4 Probation Lifecycle', styles['H2']))
story.append(Paragraph(
    'New employees typically join on probation for a configurable period (default: 6 months). During probation, the employee can use certain leave types (typically Sick Leave is allowed, but Earned Leave may be restricted). At the end of probation, a probation review is conducted. The review can result in: Confirmation (employee passes probation and is confirmed), Extension (probation period is extended), or Termination (employee is let go).',
    styles['Body']))

story.append(Paragraph(
    '<b>Probation Workflow:</b><br/>'
    '<br/>'
    '&nbsp;&nbsp;Employee joins --> Probation starts (default 6 months)<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;|<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;v<br/>'
    '&nbsp;&nbsp;Probation review submitted (by Manager/HR)<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;|-- Confirm --> Employee status = Confirmed. Notify Employee + HR.<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;|-- Extend --> HR extends probation. Notify MD for approval.<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;&nbsp;|-- MD approves extension --> Notify Employee about extended period.<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;&nbsp;|-- MD rejects --> Original probation end date stands.<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;|-- Terminate --> Employee status = Terminated. Notify Employee.<br/>'
    '<br/>'
    '&nbsp;&nbsp;<b>Validation rules:</b><br/>'
    '&nbsp;&nbsp;- Duplicate probation reviews for the same employee are blocked.<br/>'
    '&nbsp;&nbsp;- Normal reviews for already-confirmed employees are blocked.<br/>'
    '&nbsp;&nbsp;- Termination via probation updates the Employee List status to "Terminated".',
    styles['MyFlow']))

story.append(Paragraph('4.5 Resignation', styles['H2']))
story.append(Paragraph(
    'Employees can submit a resignation request from the Employee module. Navigate to Employee > Apply Resignation. Enter the resignation date, last working date (must be on or after the resignation date), reason category, detailed reason, notice period details, and handover plan. The system validates that the Last Working Date is not earlier than the Resignation Date. After submission, notifications are sent to HR, Reporting Manager, and MD. HR processes the resignation through the exit workflow including final settlement.',
    styles['Body']))

story.append(Paragraph(
    '<b>Date Validation Rule:</b> Last Working Date must be >= Resignation Date. If you enter a Last Working Date earlier than the Resignation Date, the system will reject the submission with a clear error message showing both dates.',
    styles['MyTip']))

story.append(Paragraph('4.6 Termination (HR/Admin Only)', styles['H2']))
story.append(Paragraph(
    'HR admins can initiate employee termination from Employee > Termination. The form requires: termination type (voluntary/involuntary), termination date, last working date (validated: must be >= termination date), reason category, detailed reason (minimum 20 characters), notice period served status, assets to return, and final settlement requirement. After submission, notifications are sent to HR, Reporting Manager, MD, and the Employee. The employee status is updated to "terminated" across the system.',
    styles['Body']))

story.append(Paragraph('4.7 Rejoin', styles['H2']))
story.append(Paragraph(
    'Former employees can be rejoined through the Rejoin process (Employee > Rejoin). HR submits a rejoin request with the previous employee code, new employee code, department, rejoin date, and rejoin reason. After submission, notifications are sent to HR, Reporting Manager, MD, and the Employee. The rejoin request list displays the previous employee code, new employee code, and department for each request.',
    styles['Body']))

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════
# CHAPTER 5: TROUBLESHOOTING & FAQ
# ══════════════════════════════════════════════════════════════════
story.append(Paragraph('Chapter 5: Troubleshooting & FAQ', styles['H1']))

story.append(Paragraph('5.1 Common Issues', styles['H2']))

faq_data = [
    [Paragraph('<b>Issue</b>', styles['TableHeader']), Paragraph('<b>Solution</b>', styles['TableHeader'])],
    [Paragraph('Cannot login with invite email password', styles['TableCell']), Paragraph('After an admin sends an invite, your password is in the invite email. If you tried MarqAI@2026 (the default seed password), the system may have auto-reset to that. Use the password from the invite email, or ask admin to re-send the invite.', styles['TableCell'])],
    [Paragraph('Forgot password', styles['TableCell']), Paragraph('Click "Forgot password?" on the login page. Enter your official email. A reset link will be sent (valid for 30 minutes). Click the link and set a new password.', styles['TableCell'])],
    [Paragraph('GPS not captured on check-in', styles['TableCell']), Paragraph('Your browser may have blocked location access. Allow location permission for the site. If denied, the punch is still recorded without GPS (with a warning toast).', styles['TableCell'])],
    [Paragraph('Leave balance not updated after approval', styles['TableCell']), Paragraph('The balance updates immediately when the final tier approves. Refresh the Leave Dashboard page. If still not updated, check if the leave was approved at ALL tiers (not just Tier 1).', styles['TableCell'])],
    [Paragraph('Cannot see my leave applications', styles['TableCell']), Paragraph('Click "My Leave Applications" in the sidebar (not "Leave Dashboard"). The "My Leave Applications" page filters to show only YOUR requests, even if you are an admin.', styles['TableCell'])],
    [Paragraph('Probation review rejected as duplicate', styles['TableCell']), Paragraph('The system blocks duplicate reviews for the same employee. Resolve or archive the existing review before submitting a new one.', styles['TableCell'])],
    [Paragraph('Profile edit not visible after submission', styles['TableCell']), Paragraph('HIGH sensitivity field changes require HR approval. The old value remains until HR approves the change. Check the Edit Log for the approval status.', styles['TableCell'])],
    [Paragraph('Last Working Date validation error', styles['TableCell']), Paragraph('The Last Working Date must be on or after the Resignation/Termination Date. Correct the date and re-submit.', styles['TableCell'])],
    [Paragraph('"Failed to fetch" error on login', styles['TableCell']), Paragraph('Hard-refresh the page (Ctrl+Shift+R), disable ad-blockers for the site, or try in Incognito mode. If it persists, check your internet connection.', styles['TableCell'])],
]
t4 = Table(faq_data, colWidths=[CONTENT_W*0.35, CONTENT_W*0.65])
t4.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), AMBER),
    ('TEXTCOLOR', (0,0), (-1,0), white),
    ('ALIGN', (0,0), (-1,0), 'CENTER'),
    ('FONTNAME', (0,0), (-1,0), BOLD_FONT),
    ('FONTSIZE', (0,0), (-1,-1), 9),
    ('BOTTOMPADDING', (0,0), (-1,0), 8),
    ('TOPPADDING', (0,0), (-1,0), 8),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, BG_LIGHT]),
    ('GRID', (0,0), (-1,-1), 0.5, BORDER),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('LEFTPADDING', (0,0), (-1,-1), 6),
    ('RIGHTPADDING', (0,0), (-1,-1), 6),
]))
story.append(t4)

story.append(Paragraph('5.2 Getting Help', styles['H2']))
story.append(Paragraph(
    'If you encounter an issue not covered in this manual, please contact your HR administrator. They can access the admin configuration pages, view system logs, and escalate to the platform team if needed. For urgent login issues, try the Forgot Password flow first. For workflow-specific questions (leave approval status, attendance regularization, profile edit approval), check the relevant module page which shows real-time status updates.',
    styles['Body']))

story.append(Spacer(1, 20))
story.append(HRFlowable(width='100%', thickness=2, color=GREEN))
story.append(Spacer(1, 10))
story.append(Paragraph(
    '3Boxes HRMS  |  People  |  Process  |  Technology<br/>'
    'User Manual Version 1.0  |  For end-user reference',
    ParagraphStyle(name='EndNote', fontName=BODY_FONT, fontSize=9, textColor=LIGHT_SLATE, alignment=TA_CENTER, leading=14)))

# ─── Build PDF ───
output_path = '/home/z/my-project/download/3boxes-hrms-user-manual.pdf'
doc = SimpleDocTemplate(
    output_path,
    pagesize=A4,
    leftMargin=LEFT_M,
    rightMargin=RIGHT_M,
    topMargin=TOP_M,
    bottomMargin=BOTTOM_M,
    title='3Boxes HRMS User Manual',
    author='3Boxes HRMS',
    subject='Leave, Attendance, Employee Module SOP',
    creator='3Boxes HRMS',
)
doc.build(story, onFirstPage=cover_page, onLaterPages=header_footer)
print(f'PDF generated: {output_path}')
print(f'Size: {os.path.getsize(output_path) / 1024:.1f} KB')
`;

// Write the Python script to a file
const scriptPath = '/home/z/my-project/scripts/generate-user-manual.py';
fs.writeFileSync(scriptPath, script);

// Execute the Python script
try {
  execSync(`python3 ${scriptPath}`, { stdio: 'inherit' });
  console.log('User manual PDF generated successfully.');
} catch (error) {
  console.error('Error generating PDF:', error.message);
  process.exit(1);
}
