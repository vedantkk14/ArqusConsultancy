import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { PaginatedResponse } from '../../../core/models';
import { environment } from '../../../../environments/environment';
import { Invoice, InvoiceInput, InvoiceRow, WhatsAppResult } from './invoice.models';

const INVOICES = '/invoices';

@Injectable({ providedIn: 'root' })
export class InvoicesApi {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);

  list(page: number, q: string): Observable<PaginatedResponse<InvoiceRow>> {
    return this.api.get<PaginatedResponse<InvoiceRow>>(INVOICES, { page, ...(q ? { q } : {}) });
  }

  get(id: number): Observable<Invoice> {
    return this.api.get<Invoice>(`${INVOICES}/${id}`);
  }

  create(body: InvoiceInput): Observable<Invoice> {
    return this.api.post<Invoice>(INVOICES, body);
  }

  update(id: number, body: InvoiceInput): Observable<Invoice> {
    return this.api.patch<Invoice>(`${INVOICES}/${id}`, body);
  }

  /** The real PDF the client gets, for the preview and the download button. */
  pdf(id: number): Observable<Blob> {
    return this.http.get(`${environment.apiBaseUrl}${INVOICES}/${id}/pdf`, { responseType: 'blob' });
  }

  email(id: number, body: { to: string; message: string }): Observable<{ sent_to: string; invoice: Invoice }> {
    return this.api.post(`${INVOICES}/${id}/email`, body);
  }

  whatsapp(id: number, body: { phone: string }): Observable<WhatsAppResult> {
    return this.api.post(`${INVOICES}/${id}/whatsapp`, body);
  }
}
