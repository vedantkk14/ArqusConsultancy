import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from '../../core/api/api.service';
import { PaginatedResponse } from '../../core/models';
import { AuditEntry, Profile } from './settings.models';

@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly api = inject(ApiService);

  audit(params: QueryParams): Observable<PaginatedResponse<AuditEntry>> {
    return this.api.list<AuditEntry>('/core/audit-log', params);
  }

  auditModels(): Observable<string[]> {
    return this.api.get<string[]>('/core/audit-log/models');
  }

  profile(): Observable<Profile> {
    return this.api.get<Profile>('/me');
  }

  saveProfile(body: { first_name: string; last_name: string; phone: string }): Observable<Profile> {
    return this.api.patch<Profile>('/me', body);
  }
}
