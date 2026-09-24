import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, shareReplay } from 'rxjs';
import { ApiService, QueryParams } from '../../../core/api/api.service';
import { PaginatedResponse } from '../../../core/models';
import {
  Assignee,
  DuplicateInfo,
  Interaction,
  LeadDetail,
  LeadInput,
  LeadListItem,
  LeadSummary,
  NewInteraction,
  StatusChange,
  WhatsAppTemplate,
} from './lead.models';

const BASE = '/leads';

@Injectable({ providedIn: 'root' })
export class LeadsApi {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);

  list(params: QueryParams): Observable<PaginatedResponse<LeadListItem>> {
    return this.api.list<LeadListItem>(BASE, params);
  }

  summary(params: QueryParams = {}): Observable<LeadSummary> {
    return this.api.get<LeadSummary>(`${BASE}/summary`, params);
  }

  get(id: number): Observable<LeadDetail> {
    return this.api.get<LeadDetail>(`${BASE}/${id}`);
  }

  private readonly shared = new Map<number, Observable<LeadDetail | null>>();

  /** One request shared by the route's resolver and title (null when missing or not yours). */
  getShared(id: number): Observable<LeadDetail | null> {
    let obs = this.shared.get(id);
    if (!obs) {
      obs = this.get(id).pipe(
        catchError(() => of(null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.shared.set(id, obs);
      setTimeout(() => this.shared.delete(id), 2000);
    }
    return obs;
  }

  create(body: LeadInput): Observable<LeadDetail> {
    return this.api.post<LeadDetail>(BASE, body);
  }

  update(id: number, body: Partial<LeadInput>): Observable<LeadDetail> {
    return this.api.patch<LeadDetail>(`${BASE}/${id}`, body);
  }

  remove(id: number): Observable<void> {
    return this.api.delete<void>(`${BASE}/${id}`);
  }

  checkDuplicate(phone: string, exclude?: number): Observable<{ existing: DuplicateInfo | null }> {
    return this.api.get(`${BASE}/check-duplicate`, { phone, exclude });
  }

  changeStatus(id: number, body: StatusChange): Observable<LeadDetail> {
    return this.api.post<LeadDetail>(`${BASE}/${id}/status`, body);
  }

  interactions(id: number, page = 1): Observable<PaginatedResponse<Interaction>> {
    return this.api.list<Interaction>(`${BASE}/${id}/interactions`, { page });
  }

  logInteraction(id: number, body: NewInteraction): Observable<Interaction> {
    return this.api.post<Interaction>(`${BASE}/${id}/interactions`, body);
  }

  assign(id: number, assignedTo: number): Observable<LeadDetail> {
    return this.api.post<LeadDetail>(`${BASE}/${id}/assign`, { assigned_to: assignedTo });
  }

  bulkAssign(ids: number[], assignedTo: number): Observable<{ assigned: number }> {
    return this.api.post(`${BASE}/bulk-assign`, { ids, assigned_to: assignedTo });
  }

  assignees(): Observable<Assignee[]> {
    return this.api.get<Assignee[]>(`${BASE}/assignees`);
  }

  templates(): Observable<WhatsAppTemplate[]> {
    return this.api.get<WhatsAppTemplate[]>(`${BASE}/whatsapp-templates`);
  }

  /** Rendered text only; nothing is logged. */
  whatsappPreview(id: number, templateId: number): Observable<{ text: string; url: string }> {
    return this.api.get(`${BASE}/${id}/whatsapp`, { template_id: templateId });
  }

  whatsapp(id: number, templateId: number): Observable<{ text: string; url: string }> {
    return this.api.post(`${BASE}/${id}/whatsapp`, { template_id: templateId });
  }

  finalize(id: number, amount: string, note = ''): Observable<LeadDetail> {
    return this.api.post<LeadDetail>(`${BASE}/${id}/finalize`, { amount, note });
  }

  /** CSV of the current filters (auth header added by the interceptor). */
  exportCsv(params: QueryParams): Observable<Blob> {
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return this.http.get(`${this.api.baseUrl}${BASE}/export`, { params: httpParams, responseType: 'blob' });
  }
}
