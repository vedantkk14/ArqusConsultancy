import { Injectable, inject } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiService } from '../../../core/api/api.service';
import { mockSalesExecDashboard } from './sales-exec-dashboard.mock';
import { Period, SalesExecDashboard } from './sales-exec-dashboard.models';

@Injectable({ providedIn: 'root' })
export class SalesExecDashboardService {
  private readonly api = inject(ApiService);

  load(period: Period): Observable<SalesExecDashboard> {
    if (environment.useMocks) {
      return of(mockSalesExecDashboard(period)).pipe(delay(450));
    }
    return this.api.get<SalesExecDashboard>('/dashboard/sales-exec', { period });
  }
}
