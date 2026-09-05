# HR

**Employees**, **Departments**, **Leave Requests**, and **Leave Types** in
the sidebar, under People.

## What this covers, and what it doesn't

Glide's HR module is an employee directory and leave tracker — not a full
HR suite. There's no payroll processing, no clock-in/out attendance, and
no employee self-service login: an employee record is something HR (or an
Owner/Administrator) manages on that person's behalf, not something the
employee signs into themselves. If you need those, they're on the
roadmap as later additions, not gaps in what's already here.

## The employee directory

**Employees → New employee.** Name and date of joining are the only
required fields — everything else (job title, department, who they report
to, base salary) can be filled in or added later.

**Departments** are a flat grouping with no hierarchy — just a name.
They exist for reporting, not for permissions: putting someone in
"Engineering" doesn't change what they can do in Glide. A department with
employees still assigned to it can't be deleted; move its people first.

**Reports to** links one employee to another, so you can see a simple
chain of command from an employee's own record. It's optional and has no
effect beyond display.

**Status** — Active, On leave, or Terminated — is set from the employee's
own page. Marking someone Terminated records a date of leaving (today, by
default).

## Leave

**Leave Types** are configured once per company — Annual Leave, Sick
Leave, and so on — each with an annual day allocation and whether it's
paid. Add as many as fit how your organisation actually grants leave.

**Requesting leave:** open an employee's record and click **Request
leave**. Pick a leave type and a date range; Glide counts the days for you
(weekdays only — weekends don't count against the allocation) and shows
that count on the request itself. You can't submit a request that
overlaps another pending or approved request for the same employee.

**Approving or rejecting:** anyone with leave-approval permission can act
on a pending request either from **Leave Requests** (every request across
the company) or from the employee's own page. A decided request can't be
decided again — the fix for a mistake is a new request, the same
correction-over-edit discipline every other document in Glide follows.

**Cancelling:** an employee's own pending request can be cancelled before
anyone decides it. Once approved or rejected, it's final.

## Leave balance

Each employee's record shows their remaining balance per leave type,
right in the sidebar. This number is never stored — it's calculated live
as *this leave type's annual allocation minus the days from every
approved request in the current calendar year*. That means it can never
drift out of sync with what's actually been approved, and it can go
negative if more leave was approved than allocated (Glide doesn't block
that — it's a judgment call for whoever approves the request).
