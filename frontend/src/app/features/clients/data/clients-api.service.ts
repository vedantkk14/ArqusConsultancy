import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { PaginatedResponse } from '../../../core/models';
import { ClientRow, NewClientProject } from './client.models';

const CLIENTS = '/clients';

@Injectable({ providedIn: 'root' })
export class ClientsApi {
  private readonly api = inject(ApiService);

  list(page: number, q: string): Observable<PaginatedResponse<ClientRow>> {
    return this.api.get<PaginatedResponse<ClientRow>>(CLIENTS, { page, ...(q ? { q } : {}) });
  }

  /** Admin: the client's next deal, won at this price, converted to a project, in one step. */
  addProject(clientId: number, body: NewClientProject): Observable<{ project: number; client: ClientRow }> {
    return this.api.post(`${CLIENTS}/${clientId}/projects`, body);
  }
}
