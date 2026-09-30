/** Shapes of /api/v1/leaves and /api/v1/holidays. */

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Person {
  id: number;
  name: string;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
}

export interface LeaveRequestItem {
  id: number;
  user: Person;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  decided_by: Person | null;
  decided_at: string | null;
  decision_note: string;
  created_at: string;
}

export interface LeaveSummary {
  this_month: number;
  this_year: number;
}

export interface NewLeaveRequest {
  start_date: string;
  end_date: string;
  reason: string;
}

export interface NewHoliday {
  date: string;
  name: string;
}
