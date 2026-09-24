import { HttpClient, HttpEvent, HttpEventType, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, filter, map, of, shareReplay, throwError } from 'rxjs';
import { ApiService, QueryParams, toApiError } from '../../../core/api/api.service';
import { PaginatedResponse } from '../../../core/models';
import {
  AlertProject,
  ConvertInput,
  ConvertibleLead,
  Expense,
  ExpenseInput,
  ExpenseSummary,
  Manager,
  ProjectDetail,
  ProjectEvent,
  ProjectListItem,
  ProjectSummary,
} from './project.models';

const PROJECTS = '/projects';
const EXPENSES = '/expenses';

/** Progress 0-100 while an upload runs, then the saved expense. */
export type UploadEvent = { kind: 'progress'; percent: number } | { kind: 'done'; expense: Expense };

function toForm(input: Partial<ExpenseInput>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    form.append(key, value instanceof File ? value : String(value));
  }
  return form;
}

@Injectable({ providedIn: 'root' })
export class ProjectsApi {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);

  // ---- Projects ----------
  list(params: QueryParams): Observable<PaginatedResponse<ProjectListItem>> {
    return this.api.list<ProjectListItem>(PROJECTS, params);
  }

  summary(params: QueryParams = {}): Observable<ProjectSummary> {
    return this.api.get<ProjectSummary>(`${PROJECTS}/summary`, params);
  }

  get(id: number): Observable<ProjectDetail> {
    return this.api.get<ProjectDetail>(`${PROJECTS}/${id}`);
  }

  private readonly shared = new Map<number, Observable<ProjectDetail | null>>();

  /** One request shared by the route's resolver and title (null when missing or not yours). */
  getShared(id: number): Observable<ProjectDetail | null> {
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

  convertible(lead?: number): Observable<{ count: number; results: ConvertibleLead[] }> {
    return this.api.get(`${PROJECTS}/convertible`, lead ? { lead } : {});
  }

  managers(): Observable<Manager[]> {
    return this.api.get<Manager[]>(`${PROJECTS}/managers`);
  }

  convert(body: ConvertInput): Observable<ProjectDetail> {
    return this.api.post<ProjectDetail>(PROJECTS, body);
  }

  update(id: number, body: Partial<ConvertInput>): Observable<ProjectDetail> {
    return this.api.patch<ProjectDetail>(`${PROJECTS}/${id}`, body);
  }

  changeBudget(id: number, sanctioned_budget: string, reason: string): Observable<ProjectDetail> {
    return this.api.post<ProjectDetail>(`${PROJECTS}/${id}/budget`, { sanctioned_budget, reason });
  }

  assignPm(id: number, pm: number | null): Observable<ProjectDetail> {
    return this.api.post<ProjectDetail>(`${PROJECTS}/${id}/assign-pm`, { pm });
  }

  complete(id: number): Observable<ProjectDetail> {
    return this.api.post<ProjectDetail>(`${PROJECTS}/${id}/complete`, {});
  }

  reopen(id: number, reason: string): Observable<ProjectDetail> {
    return this.api.post<ProjectDetail>(`${PROJECTS}/${id}/reopen`, { reason });
  }

  events(id: number, page = 1): Observable<PaginatedResponse<ProjectEvent>> {
    return this.api.list<ProjectEvent>(`${PROJECTS}/${id}/events`, { page });
  }

  // ---- Expenses ----------
  projectExpenses(id: number, params: QueryParams): Observable<PaginatedResponse<Expense>> {
    return this.api.list<Expense>(`${PROJECTS}/${id}/expenses`, params);
  }

  expenses(params: QueryParams): Observable<PaginatedResponse<Expense>> {
    return this.api.list<Expense>(EXPENSES, params);
  }

  expenseSummary(params: QueryParams = {}): Observable<ExpenseSummary> {
    return this.api.get<ExpenseSummary>(`${EXPENSES}/summary`, params);
  }

  alerts(page = 1): Observable<PaginatedResponse<AlertProject>> {
    return this.api.list<AlertProject>(`${EXPENSES}/alerts`, { page, page_size: 50 });
  }

  /** Multipart upload with progress; errors arrive in the standard {code, message, details} shape. */
  addExpense(projectId: number, input: ExpenseInput): Observable<UploadEvent> {
    return this.upload('post', `${PROJECTS}/${projectId}/expenses`, input);
  }

  updateExpense(id: number, input: Partial<ExpenseInput>): Observable<UploadEvent> {
    return this.upload('patch', `${EXPENSES}/${id}`, input);
  }

  voidExpense(id: number, reason: string): Observable<Expense> {
    return this.api.post<Expense>(`${EXPENSES}/${id}/void`, { reason });
  }

  /** The receipt file, fetched with the user's token (there is no public URL). */
  receipt(id: number): Observable<Blob> {
    return this.http
      .get(`${this.api.baseUrl}${EXPENSES}/${id}/receipt`, { responseType: 'blob' })
      .pipe(catchError((err) => throwError(() => toApiError(err))));
  }

  exportCsv(params: QueryParams): Observable<Blob> {
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return this.http
      .get(`${this.api.baseUrl}${EXPENSES}/export`, { params: httpParams, responseType: 'blob' })
      .pipe(catchError((err) => throwError(() => toApiError(err))));
  }

  private upload(method: 'post' | 'patch', path: string, input: Partial<ExpenseInput>): Observable<UploadEvent> {
    const url = `${this.api.baseUrl}${path}`;
    const options = { reportProgress: true, observe: 'events' as const };
    const request: Observable<HttpEvent<Expense>> =
      method === 'post' ? this.http.post<Expense>(url, toForm(input), options) : this.http.patch<Expense>(url, toForm(input), options);
    return request.pipe(
      map((event): UploadEvent | null => {
        if (event.type === HttpEventType.UploadProgress) {
          return { kind: 'progress', percent: event.total ? Math.round((100 * event.loaded) / event.total) : 0 };
        }
        return event.type === HttpEventType.Response ? { kind: 'done', expense: event.body as Expense } : null;
      }),
      filter((event): event is UploadEvent => event !== null),
      catchError((err) => throwError(() => toApiError(err))),
    );
  }
}
