import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from '../../core/api/api.service';
import { FinancialReport, FunnelReport, MarginReport, SalesReport } from './reports.models';

export type ReportSlug = 'sales' | 'financial' | 'project-margin' | 'lead-funnel';

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);

  sales(p: QueryParams): Observable<SalesReport> {
    return this.api.get('/reports/sales', p);
  }

  financial(p: QueryParams): Observable<FinancialReport> {
    return this.api.get('/reports/financial', p);
  }

  margin(p: QueryParams): Observable<MarginReport> {
    return this.api.get('/reports/project-margin', p);
  }

  funnel(p: QueryParams): Observable<FunnelReport> {
    return this.api.get('/reports/lead-funnel', p);
  }

  /** The same report as a CSV file (the server neutralises spreadsheet formulas). */
  csv(slug: ReportSlug, p: QueryParams): Observable<Blob> {
    const params = Object.fromEntries(Object.entries({ ...p, export: 'csv' }).filter(([, v]) => v));
    return this.http.get(`${this.api.baseUrl}/reports/${slug}`, { params: params as Record<string, string>, responseType: 'blob' });
  }
}
