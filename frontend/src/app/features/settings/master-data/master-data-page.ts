import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ApiError } from '../../../core/models';
import { ErrorState } from '../../../shared/error-state/error-state';
import { Skeleton } from '../../../shared/skeleton/skeleton';
import { SettingsApi } from '../settings.api';
import { MasterList } from '../settings.models';

/** The reference lists the app uses, read from the code that defines them. Nothing here is editable. */
@Component({
  selector: 'app-master-data-page',
  imports: [ErrorState, MatIconModule, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './master-data-page.html',
  styleUrls: ['../../team/ui/list-kit.scss', './master-data-page.scss'],
})
export class MasterDataPage {
  private readonly api = inject(SettingsApi);
  protected readonly lists = signal<MasterList[] | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly placeholders = [0, 1, 2, 3];

  constructor() {
    this.load();
  }

  protected load(): void {
    this.error.set(null);
    this.api.masterData().subscribe({ next: (r) => this.lists.set(r.lists), error: (e: ApiError) => this.error.set(e) });
  }
}
