import { Role } from '../../core/models';

export interface TeamUser {
  id: number;
  username: string;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  /** 2-decimal string for sales executives, null for every other role. */
  commission_rate: string | null;
  last_login: string | null;
  date_joined: string;
}

export interface ExecLoad {
  id: number;
  name: string;
  open_leads: number;
  overdue: number;
}

export interface PmLoad {
  id: number;
  name: string;
  running_projects: number;
  over_budget: number;
}

export interface AssignmentsOverview {
  data_sources: { leads: boolean; projects: boolean };
  execs: ExecLoad[];
  pms: PmLoad[];
}

export interface UserEdit {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: Role;
}

export const RATE_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

/** 0-100 with at most two decimals (the API rejects anything else). */
export function isValidRate(value: string): boolean {
  return RATE_PATTERN.test(value.trim()) && Number(value) >= 0 && Number(value) <= 100;
}
