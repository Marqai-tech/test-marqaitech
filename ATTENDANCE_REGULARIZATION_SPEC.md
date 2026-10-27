**Attendance Regularization --- Notification & Email Workflow**

HRMS Workflow Spec · Version 1.0 · 06 October 2026

# 1. HR Proxy → Regularization for Selected Employee

HR selects an employee and submits a Punch-in / Punch-out regularization
request on their behalf.

Flow: HR submits → Employee notified → Reporting Manager notified for
approval Approves/Rejects → Employee notified → HR notified → Attendance
updated.

  ---------------------------------------------------------------------------
  **Event**             **Employee**      **Reporting        **HR**
                                          Manager**          
  --------------------- ----------------- ------------------ ----------------
  **HR submits          Notification +    Notification +     ---
  request**             Email             Email              

  **Manager approves**  Notification +    ---                Notification +
                        Email                                Email

  **Manager rejects**   Notification +    ---                Notification +
                        Email                                Email
  ---------------------------------------------------------------------------

**The employee must NOT receive a notification saying \"You submitted a
regularization request\" --- HR actually submitted it. Always phrase as
\"Submitted on Your Behalf\".**

## Notifications

+-----------------------------------------------------------------------+
| **Employee --- After HR Submits**                                     |
|                                                                       |
| Attendance Regularization Submitted on Your Behalf                    |
|                                                                       |
| HR has submitted an attendance regularization request for you.        |
|                                                                       |
| Date: 06 October 2026                                                 |
|                                                                       |
| Regularization: Punch-in                                              |
|                                                                       |
| Requested Time: 09:30 AM                                              |
|                                                                       |
| Reason: Forgot to punch in                                            |
|                                                                       |
| Submitted By: HR -- \[HR Name\]                                       |
|                                                                       |
| Status: Pending Manager Approval                                      |
+-----------------------------------------------------------------------+
| **Reporting Manager --- Approval Required**                           |
|                                                                       |
| Attendance Regularization Approval Required                           |
|                                                                       |
| HR has submitted an attendance regularization request on behalf of    |
| \[Employee Name\].                                                    |
|                                                                       |
| Date: 06 October 2026                                                 |
|                                                                       |
| Punch-in: 09:30 AM                                                    |
|                                                                       |
| Punch-out: ---                                                        |
|                                                                       |
| Reason: Forgot to punch in                                            |
|                                                                       |
| Submitted By: \[HR Name\]                                             |
|                                                                       |
| Please review and Approve / Reject the request.                       |
+-----------------------------------------------------------------------+
| **Employee --- After Approval**                                       |
|                                                                       |
| Attendance Regularization Approved                                    |
|                                                                       |
| Your attendance regularization request for 06 October 2026 has been   |
| approved by \[Manager Name\].                                         |
|                                                                       |
| Punch-in: 09:30 AM                                                    |
|                                                                       |
| Status: Approved                                                      |
+-----------------------------------------------------------------------+
| **HR --- After Approval**                                             |
|                                                                       |
| Attendance Regularization Approved                                    |
|                                                                       |
| The attendance regularization request submitted for \[Employee Name\] |
| has been approved by \[Manager Name\].                                |
|                                                                       |
| The attendance record has been updated accordingly.                   |
+-----------------------------------------------------------------------+
| **Employee --- After Rejection**                                      |
|                                                                       |
| Attendance Regularization Rejected                                    |
|                                                                       |
| Your attendance regularization request for 06 October 2026 has been   |
| rejected by \[Manager Name\].                                         |
|                                                                       |
| Reason: \[Manager Comment\]                                           |
+-----------------------------------------------------------------------+
| **HR --- After Rejection**                                            |
|                                                                       |
| Attendance Regularization Rejected                                    |
|                                                                       |
| The regularization request submitted for \[Employee Name\] has been   |
| rejected by \[Manager Name\].                                         |
|                                                                       |
| Reason: \[Manager Comment\]                                           |
+-----------------------------------------------------------------------+

# 2. Employee → Regularization Request

Employee directly submits a Punch-in / Punch-out regularization request.

Flow: Employee submits → Employee gets confirmation → Reporting Manager
notified Approves/Rejects → Employee notified → HR notified → Attendance
updated.

  ---------------------------------------------------------------------------
  **Event**             **Employee**      **Reporting        **HR**
                                          Manager**          
  --------------------- ----------------- ------------------ ----------------
  **Employee submits**  Confirmation      Notification +     ---
                                          Email              

  **Manager approves**  Notification +    ---                Notification +
                        Email                                Email

  **Manager rejects**   Notification +    ---                Notification +
                        Email                                Email
  ---------------------------------------------------------------------------

## Notifications

+-----------------------------------------------------------------------+
| **Employee --- Submission Confirmation**                              |
|                                                                       |
| Attendance Regularization Request Submitted                           |
|                                                                       |
| Your attendance regularization request has been submitted             |
| successfully.                                                         |
|                                                                       |
| Date: 06 October 2026                                                 |
|                                                                       |
| Regularization: Punch-in                                              |
|                                                                       |
| Requested Time: 09:30 AM                                              |
|                                                                       |
| Reason: Forgot to punch in                                            |
|                                                                       |
| Status: Pending Manager Approval                                      |
+-----------------------------------------------------------------------+
| **Reporting Manager --- Approval Required**                           |
|                                                                       |
| Attendance Regularization Approval Required                           |
|                                                                       |
| \[Employee Name\] has submitted an attendance regularization request. |
|                                                                       |
| Date: 06 October 2026                                                 |
|                                                                       |
| Punch-in: 09:30 AM                                                    |
|                                                                       |
| Punch-out: ---                                                        |
|                                                                       |
| Reason: Forgot to punch in                                            |
|                                                                       |
| Please review and Approve / Reject the request.                       |
+-----------------------------------------------------------------------+
| **Employee --- After Approval**                                       |
|                                                                       |
| Attendance Regularization Approved                                    |
|                                                                       |
| Your attendance regularization request for 06 October 2026 has been   |
| approved by \[Manager Name\].                                         |
|                                                                       |
| Date: 06 October 2026                                                 |
|                                                                       |
| Punch-in: 09:30 AM                                                    |
|                                                                       |
| Status: Approved                                                      |
+-----------------------------------------------------------------------+
| **HR --- After Approval**                                             |
|                                                                       |
| Attendance Regularization Approved                                    |
|                                                                       |
| The attendance regularization request submitted by \[Employee Name\]  |
| has been approved by \[Manager Name\].                                |
|                                                                       |
| The attendance record has been updated accordingly.                   |
+-----------------------------------------------------------------------+
| **Employee --- After Rejection**                                      |
|                                                                       |
| Attendance Regularization Rejected                                    |
|                                                                       |
| Your attendance regularization request for 06 October 2026 has been   |
| rejected by \[Manager Name\].                                         |
|                                                                       |
| Reason: \[Manager Comment\]                                           |
+-----------------------------------------------------------------------+
| **HR --- After Rejection**                                            |
|                                                                       |
| Attendance Regularization Rejected                                    |
|                                                                       |
| The attendance regularization request submitted by \[Employee Name\]  |
| has been rejected.                                                    |
|                                                                       |
| Reason: \[Manager Comment\]                                           |
+-----------------------------------------------------------------------+

# 3. HRMS Audit Trail

For both workflows, store the following audit fields. They are mandatory
for compliance and dispute resolution.

  -----------------------------------------------------------------------
  **Audit Field**             **Example**
  --------------------------- -------------------------------------------
  **Requested For**           John Doe

  **Submitted By**            John Doe / HR

  **Request Type**            Punch-in / Punch-out / Both

  **Attendance Date**         06-Oct-2026

  **Existing Punch-in**       ---

  **Existing Punch-out**      06:15 PM

  **Requested Punch-in**      09:30 AM

  **Requested Punch-out**     06:30 PM

  **Reason**                  Forgot to punch in

  **Approver**                Reporting Manager

  **Status**                  Pending / Approved / Rejected

  **Manager Comment**         Approved

  **Submitted Date & Time**   06-Oct-2026 10:15 AM

  **Action Date & Time**      06-Oct-2026 11:05 AM

  **Source**                  Employee / HR Proxy
  -----------------------------------------------------------------------

# 4. Key Difference --- Developer Note

Employee Request: Employee → Manager → Employee + HR → Attendance Update

HR Proxy Request: HR → Employee + Manager → Employee + HR → Attendance
Update

*For HR Proxy, the system must always retain \"Submitted By HR\" and
\"Requested For Employee\" as separate audit fields. This prevents
confusion about who actually initiated the regularization request.*
