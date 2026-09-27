import { Injectable, inject } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiService } from '../../../core/api/api.service';
import { mockSalesManagerDashboard } from './sales-manager-dashboard.mock';
import { Period, SalesManagerDashboard } from './sales-manager-dashboard.models';

@Injectable({ providedIn: 'root' })
export class SalesManagerDashboardService {
  private readonly api = inject(ApiService);

  load(period: Period): Observable<SalesManagerDashboard> {
    if (environment.useMocks) {
      return of(mockSalesManagerDashboard(period)).pipe(delay(450));
    }
    return this.api.get<SalesManagerDashboard>('/dashboard/sales-manager', { period });
  }
}
