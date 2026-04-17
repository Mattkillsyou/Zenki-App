// ──────────────────────────────────────────────────────────────────
// EMPLOYEE DAILY CHECKLIST
//
// Three kinds of tasks:
//  - default-daily: admin-defined template tasks that re-appear every day
//  - time-sensitive: admin-assigned tasks with a specific due date (today, tomorrow, etc.)
//  - personal: employee-added tasks, only visible to that employee
//
// Tasks are marked done per date. Completion resets daily for default
// tasks — we record completions in a separate map keyed by taskId+date.
// ──────────────────────────────────────────────────────────────────

export type TaskSource = 'default' | 'assigned' | 'personal';

export interface EmployeeTask {
  id: string;
  title: string;
  description?: string;
  source: TaskSource;
  /** For assigned tasks: the date the task is due (YYYY-MM-DD). Undefined for default/personal. */
  dueDate?: string;
  /** For personal tasks: the employee that created it. Undefined for admin-created tasks. */
  ownerMemberId?: string;
  /** For assigned tasks: which employee they're assigned to. Undefined = for all employees. */
  assignedToMemberId?: string;
  createdAt: string;
}

/** Tracks which task+date pairs have been marked complete. */
export interface TaskCompletion {
  taskId: string;
  memberId: string;
  date: string;    // YYYY-MM-DD — the day the task was completed for
  completedAt: string; // ISO timestamp
}
