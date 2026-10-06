export interface ClientProjectRow {
  id: number;
  /** The client's #1, #2, ... project number. */
  no: number;
  name: string;
  status: 'RUNNING' | 'COMPLETED';
  pm_name: string | null;
  start_date: string | null;
}

/** A client (lead) who has at least one project. No money: prices live in each project's finance panel. */
export interface ClientRow {
  id: number;
  name: string;
  phone: string;
  email: string;
  total_projects: number;
  running_projects: number;
  completed_projects: number;
  projects: ClientProjectRow[];
}

export interface NewClientProject {
  name: string;
  requirements: string;
  /** Decimal string, e.g. "250000.00". */
  amount: string;
  pm: number | null;
  start_date: string | null;
  expected_end_date: string | null;
}
