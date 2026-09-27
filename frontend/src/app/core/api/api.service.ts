import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiError, PaginatedResponse } from '../models';

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

/** Turns any HttpErrorResponse into the backend's {code, message, details} shape. */
export function toApiError(err: HttpErrorResponse): ApiError {
  const body = err.error?.error;
  if (body && typeof body === 'object') {
    return {
      status: err.status,
      code: body.code ?? 'error',
      message: body.message ?? 'Request failed.',
      details: body.details ?? {},
    };
  }
  return err.status === 0
    ? { status: 0, code: 'network_error', message: 'Cannot reach the server.', details: {} }
    : { status: err.status, code: 'error', message: err.statusText || 'Request failed.', details: {} };
}

/** Thin wrapper over HttpClient: base URL from the environment, normalised errors. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  readonly baseUrl = environment.apiBaseUrl;

  get<T>(path: string, params?: QueryParams): Observable<T> {
    return this.http.get<T>(this.url(path), { params: this.toParams(params) }).pipe(this.mapError());
  }

  /** Paginated list endpoints (?page=&page_size=). */
  list<T>(path: string, params?: QueryParams): Observable<PaginatedResponse<T>> {
    return this.get<PaginatedResponse<T>>(path, params);
  }

  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.post<T>(this.url(path), body).pipe(this.mapError());
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.url(path), body).pipe(this.mapError());
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.url(path), body).pipe(this.mapError());
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.url(path)).pipe(this.mapError());
  }

  private url(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private toParams(params?: QueryParams): HttpParams {
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== null && value !== undefined && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return httpParams;
  }

  private mapError<T>() {
    return catchError<T, Observable<never>>((err) =>
      throwError(() => (err instanceof HttpErrorResponse ? toApiError(err) : err)),
    );
  }
}
