import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { PaginatedResponse } from '../../../core/models';
import { Holiday, LeaveRequestItem, LeaveSummary, NewHoliday, NewLeaveRequest } from './leave.models';

const BASE = '/leaves';

@Injectable({ providedIn: 'root' })
export class LeavesApi {
  private readonly api = inject(ApiService);

  /** Admin sees every request; everyone else only their own. Pass userId to filter by a specific employee. */
  list(page = 1, userId?: number): Observable<PaginatedResponse<LeaveRequestItem>> {
    const params: Record<string, string | number> = { page };
    if (userId) params['user_id'] = userId;
    return this.api.list<LeaveRequestItem>(BASE, params);
  }

  /** Leave days taken this month/year. Pass `userId` (admin only) to check someone else's history. */
  summary(userId?: number): Observable<LeaveSummary> {
    return this.api.get<LeaveSummary>(`${BASE}/summary`, { user_id: userId });
  }

  request(body: NewLeaveRequest): Observable<LeaveRequestItem> {
    return this.api.post<LeaveRequestItem>(BASE, body);
  }

  approve(id: number, note = ''): Observable<LeaveRequestItem> {
    return this.api.post<LeaveRequestItem>(`${BASE}/${id}/approve`, { note });
  }

  reject(id: number, note = ''): Observable<LeaveRequestItem> {
    return this.api.post<LeaveRequestItem>(`${BASE}/${id}/reject`, { note });
  }

  /** Withdraw your own request while it is still pending. */
  remove(id: number): Observable<void> {
    return this.api.delete<void>(`${BASE}/${id}`);
  }

  holidays(): Observable<Holiday[]> {
    return this.api.get<Holiday[]>('/holidays');
  }

  addHoliday(body: NewHoliday): Observable<Holiday> {
    return this.api.post<Holiday>('/holidays', body);
  }

  removeHoliday(id: number): Observable<void> {
    return this.api.delete<void>(`/holidays/${id}`);
  }
}
