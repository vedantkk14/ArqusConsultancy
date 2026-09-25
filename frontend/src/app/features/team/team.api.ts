import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from '../../core/api/api.service';
import { PaginatedResponse } from '../../core/models';
import { AssignmentsOverview, MemberPerformance, TeamUser, UserEdit } from './team.models';

@Injectable({ providedIn: 'root' })
export class TeamApi {
  private readonly api = inject(ApiService);

  users(params: QueryParams): Observable<PaginatedResponse<TeamUser>> {
    return this.api.list<TeamUser>('/users', params);
  }

  update(id: number, body: Partial<UserEdit>): Observable<TeamUser> {
    return this.api.patch<TeamUser>(`/users/${id}`, body);
  }

  deactivate(id: number): Observable<TeamUser> {
    return this.api.post<TeamUser>(`/users/${id}/deactivate`);
  }

  reactivate(id: number): Observable<TeamUser> {
    return this.api.post<TeamUser>(`/users/${id}/reactivate`);
  }

  /** The new temporary password is in this response only; it can't be read again. */
  resetPassword(id: number): Observable<{ temporary_password: string; must_change_password: boolean }> {
    return this.api.post(`/users/${id}/reset-password`);
  }

  setCommission(id: number, rate: string): Observable<TeamUser> {
    return this.api.patch<TeamUser>(`/users/${id}/commission-rate`, { commission_rate: rate });
  }

  performance(id: number): Observable<MemberPerformance> {
    return this.api.get<MemberPerformance>(`/users/${id}/performance`);
  }

  assignments(): Observable<AssignmentsOverview> {
    return this.api.get<AssignmentsOverview>('/users/assignments-overview');
  }
}
