import { Injectable, inject } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiService } from '../../../core/api/api.service';
import { mockPmDashboard } from './pm-dashboard.mock';
import { PmDashboard } from './pm-dashboard.models';

@Injectable({ providedIn: 'root' })
export class PmDashboardService {
  private readonly api = inject(ApiService);

  load(): Observable<PmDashboard> {
    if (environment.useMocks) {
      return of(mockPmDashboard()).pipe(delay(450));
    }
    return this.api.get<PmDashboard>('/dashboard/pm');
  }
}
