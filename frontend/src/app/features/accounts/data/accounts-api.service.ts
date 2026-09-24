import { HttpClient, HttpEvent, HttpEventType, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, filter, map, of, shareReplay, throwError } from 'rxjs';
import { ApiService, QueryParams, toApiError } from '../../../core/api/api.service';
import { PaginatedResponse } from '../../../core/models';
import {
  LedgerDetail,
  LedgerEvent,
  LedgerOption,
  LedgerRow,
  LedgerSummary,
  Payment,
  PaymentInput,
  PaymentSummary,
  Reminder,
  Statement,
} from './account.models';

const LEDGERS = '/ledgers';
const PAYMENTS = '/payments';

/** Progress 0-100 while an upload runs, then the saved payment. */
export type UploadEvent = { kind: 'progress'; percent: number } | { kind: 'done'; payment: Payment };

function toForm(input: Partial<PaymentInput>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    form.append(key, value instanceof File ? value : String(value));
  }
  return form;
}

function toParams(params: QueryParams): HttpParams {
  let httpParams = new HttpParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      httpParams = httpParams.set(key, String(value));
    }
  }
  return httpParams;
}

@Injectable({ providedIn: 'root' })
export class AccountsApi {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);

  // ---- Ledgers ----------
  ledgers(params: QueryParams): Observable<PaginatedResponse<LedgerRow>> {
    return this.api.list<LedgerRow>(LEDGERS, params);
  }

  summary(params: QueryParams = {}): Observable<LedgerSummary> {
    return this.api.get<LedgerSummary>(`${LEDGERS}/summary`, params);
  }

  options(q = ''): Observable<LedgerOption[]> {
    return this.api.get<LedgerOption[]>(`${LEDGERS}/options`, { q });
  }

  ledger(id: number): Observable<LedgerDetail> {
    return this.api.get<LedgerDetail>(`${LEDGERS}/${id}`);
  }

  private readonly shared = new Map<number, Observable<LedgerDetail | null>>();

  /** One request shared by the route's resolver and title (null when missing). */
  ledgerShared(id: number): Observable<LedgerDetail | null> {
    let obs = this.shared.get(id);
    if (!obs) {
      obs = this.ledger(id).pipe(
        catchError(() => of(null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.shared.set(id, obs);
      setTimeout(() => this.shared.delete(id), 2000);
    }
    return obs;
  }

  finalize(id: number, amount: string, note = ''): Observable<LedgerDetail> {
    return this.api.post<LedgerDetail>(`${LEDGERS}/${id}/finalize`, { amount, note });
  }

  reviseTotal(id: number, amount: string, reason: string): Observable<LedgerDetail> {
    return this.api.post<LedgerDetail>(`${LEDGERS}/${id}/revise-total`, { amount, reason });
  }

  reminder(id: number): Observable<Reminder> {
    return this.api.post<Reminder>(`${LEDGERS}/${id}/reminder`, {});
  }

  events(id: number, page = 1): Observable<PaginatedResponse<LedgerEvent>> {
    return this.api.list<LedgerEvent>(`${LEDGERS}/${id}/events`, { page });
  }

  ledgerPayments(id: number, params: QueryParams): Observable<PaginatedResponse<Payment>> {
    return this.api.list<Payment>(`${LEDGERS}/${id}/payments`, params);
  }

  statement(id: number, from = '', to = ''): Observable<Statement> {
    return this.api.get<Statement>(`${LEDGERS}/${id}/statement`, { from, to });
  }

  statementCsv(id: number, from = '', to = ''): Observable<Blob> {
    return this.blob(`${LEDGERS}/${id}/statement`, { from, to, format: 'csv' });
  }

  exportLedgers(params: QueryParams): Observable<Blob> {
    return this.blob(`${LEDGERS}/export`, params);
  }

  // ---- Payments ----------
  payments(params: QueryParams): Observable<PaginatedResponse<Payment>> {
    return this.api.list<Payment>(PAYMENTS, params);
  }

  paymentSummary(params: QueryParams = {}): Observable<PaymentSummary> {
    return this.api.get<PaymentSummary>(`${PAYMENTS}/summary`, params);
  }

  payment(id: number): Observable<Payment> {
    return this.api.get<Payment>(`${PAYMENTS}/${id}`);
  }

  voidPayment(id: number, reason: string): Observable<Payment> {
    return this.api.post<Payment>(`${PAYMENTS}/${id}/void`, { reason });
  }

  /** Multipart upload with progress; errors arrive in the standard {code, message, details} shape. */
  addPayment(ledgerId: number, input: PaymentInput): Observable<UploadEvent> {
    const options = { reportProgress: true, observe: 'events' as const };
    const request: Observable<HttpEvent<Payment>> = this.http.post<Payment>(
      `${this.api.baseUrl}${LEDGERS}/${ledgerId}/payments`,
      toForm(input),
      options,
    );
    return request.pipe(
      map((event): UploadEvent | null => {
        if (event.type === HttpEventType.UploadProgress) {
          return { kind: 'progress', percent: event.total ? Math.round((100 * event.loaded) / event.total) : 0 };
        }
        return event.type === HttpEventType.Response ? { kind: 'done', payment: event.body as Payment } : null;
      }),
      filter((event): event is UploadEvent => event !== null),
      catchError((err) => throwError(() => toApiError(err))),
    );
  }

  /** The proof file, fetched with the user's token (there is no public URL). */
  proof(id: number): Observable<Blob> {
    return this.blob(`${PAYMENTS}/${id}/proof`, {});
  }

  exportPayments(params: QueryParams): Observable<Blob> {
    return this.blob(`${PAYMENTS}/export`, params);
  }

  private blob(path: string, params: QueryParams): Observable<Blob> {
    return this.http
      .get(`${this.api.baseUrl}${path}`, { params: toParams(params), responseType: 'blob' })
      .pipe(catchError((err) => throwError(() => toApiError(err))));
  }
}
