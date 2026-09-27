import { inject } from '@angular/core';
import { CanMatchFn } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/models';

/**
 * Dashboard home dispatch: a Sales Exec gets this page at the same `/dashboard` route the admin
 * and Sales Manager dashboards already own. Other roles fall through to the next `''` route in
 * `dashboard.routes.ts` (unaffected - this file only adds a branch, never removes one).
 */
export const salesExecDashboardMatch: CanMatchFn = () => inject(AuthService).role() === Role.SalesExec;
