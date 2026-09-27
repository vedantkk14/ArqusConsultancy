import { Injectable, inject } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/api/api.service';
import { mockDashboard } from './dashboard.mock';
import { AdminDashboard, Period } from './dashboard.models';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService);

  loadAdmin(period: Period): Observable<AdminDashboard> {
    if (environment.useMocks) {
      return of(mockDashboard(period)).pipe(delay(450));
    }
    return this.api.get<AdminDashboard>('/dashboard/admin', { period });
  }
}
