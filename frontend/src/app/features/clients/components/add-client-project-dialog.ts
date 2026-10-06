import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiError } from '../../../core/models';
import { DialogHead } from '../../leads/components/dialogs/dialog-head';
import { Manager } from '../../projects/data/project.models';
import { ProjectsApi } from '../../projects/data/projects-api.service';
import { ClientRow } from '../data/client.models';
import { ClientsApi } from '../data/clients-api.service';

export interface AddClientProjectData {
  client: Pick<ClientRow, 'id' | 'name'>;
}

type FieldKey = 'name' | 'amount' | 'pm' | 'expected_end_date';
const FIELD_IDS: Record<FieldKey, string> = {
  name: 'np-name',
  amount: 'np-amount',
  pm: 'np-pm',
  expected_end_date: 'np-end',
};
const ORDER: FieldKey[] = ['name', 'amount', 'pm', 'expected_end_date'];

/** Admin: a new project for an existing client. Name, requirements, price and manager in one go. */
@Component({
  selector: 'app-add-client-project-dialog',
  imports: [DialogHead, FormsModule, MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../leads/components/dialogs/dialog.scss',
  styles: `
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
    @media (max-width: 480px) { .row2 { grid-template-columns: 1fr; } }
    .hint { margin: 0; color: var(--ink-3); font-size: var(--text-xs); }
  `,
  template: `
    <app-dialog-head
      [title]="'New project for ' + data.client.name"
      subtitle="It becomes this client's next project (#2, #3...) and starts running straight away."
    />
    <form (ngSubmit)="save()" novalidate>
      <div class="field">
        <label for="np-name">Project name</label>
        <input
          id="np-name"
          name="name"
          type="text"
          maxlength="200"
          autocomplete="off"
          [(ngModel)]="name"
          [attr.aria-invalid]="errors().name ? true : null"
        />
        @if (errors().name) {
          <p class="error">{{ errors().name }}</p>
        }
      </div>

      <div class="field">
        <label for="np-req">Client requirements</label>
        <textarea id="np-req" name="requirements" maxlength="2000" [(ngModel)]="requirements"></textarea>
      </div>

      <div class="field">
        <label for="np-amount">Project price (₹)</label>
        <input
          id="np-amount"
          name="amount"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          placeholder="e.g. 250000"
          [(ngModel)]="amount"
          [attr.aria-invalid]="errors().amount ? true : null"
        />
        <p class="hint">The agreed total. Only admins see it.</p>
        @if (errors().amount) {
          <p class="error">{{ errors().amount }}</p>
        }
      </div>

      <div class="field">
        <label for="np-pm">Project manager</label>
        <select id="np-pm" name="pm" [(ngModel)]="pm">
          <option value="">Assign later</option>
          @for (m of managers(); track m.id) {
            <option [value]="'' + m.id">{{ m.name }} · {{ m.running_projects }} running</option>
          }
        </select>
        @if (errors().pm) {
          <p class="error">{{ errors().pm }}</p>
        }
      </div>

      <div class="row2">
        <div class="field">
          <label for="np-start">Start date</label>
          <input id="np-start" name="start" type="date" [(ngModel)]="start" />
        </div>
        <div class="field">
          <label for="np-end">Expected end date</label>
          <input
            id="np-end"
            name="end"
            type="date"
            [(ngModel)]="end"
            [attr.aria-invalid]="errors().expected_end_date ? true : null"
          />
          @if (errors().expected_end_date) {
            <p class="error">{{ errors().expected_end_date }}</p>
          }
        </div>
      </div>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving()">
          {{ saving() ? 'Adding…' : 'Add project' }}
        </button>
      </div>
    </form>
  `,
})
export class AddClientProjectDialog {
  protected readonly data = inject<AddClientProjectData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<AddClientProjectDialog, { project: number; client: ClientRow }>);
  private readonly api = inject(ClientsApi);

  protected name = '';
  protected requirements = '';
  protected amount = '';
  protected pm = '';
  protected start = '';
  protected end = '';
  protected readonly managers = signal<Manager[]>([]);
  protected readonly saving = signal(false);
  protected readonly errors = signal<Partial<Record<FieldKey, string>>>({});
  protected readonly error = signal('');

  constructor() {
    inject(ProjectsApi)
      .managers()
      .subscribe({ next: (list) => this.managers.set(list), error: () => undefined });
  }

  /** "2,50,000" or "250000.5" to "250000.50"; null when it is not a positive amount. */
  private parseAmount(): string | null {
    const value = Number(this.amount.replace(/[,\s₹]/g, ''));
    return Number.isFinite(value) && value > 0 ? value.toFixed(2) : null;
  }

  protected save(): void {
    if (this.saving()) {
      return;
    }
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!this.name.trim()) {
      errors.name = 'Enter a project name.';
    }
    const amount = this.parseAmount();
    if (!amount) {
      errors.amount = 'Enter the project price.';
    }
    if (this.start && this.end && this.end < this.start) {
      errors.expected_end_date = 'The end date cannot be before the start date.';
    }
    this.errors.set(errors);
    this.error.set('');
    const first = ORDER.find((key) => errors[key]);
    if (first || !amount) {
      if (first) {
        document.getElementById(FIELD_IDS[first])?.focus();
      }
      return;
    }
    this.saving.set(true);
    this.api
      .addProject(this.data.client.id, {
        name: this.name.trim(),
        requirements: this.requirements.trim(),
        amount,
        pm: this.pm ? Number(this.pm) : null,
        start_date: this.start || null,
        expected_end_date: this.end || null,
      })
      .subscribe({
        next: (result) => this.ref.close(result),
        error: (err: ApiError) => {
          this.saving.set(false);
          this.fail(err);
        },
      });
  }

  private fail(err: ApiError): void {
    const mapped: Partial<Record<FieldKey, string>> = {};
    for (const key of ORDER) {
      const messages = err.details?.[key];
      if (Array.isArray(messages) && messages.length) {
        mapped[key] = String(messages[0]);
      }
    }
    if (Object.keys(mapped).length) {
      this.errors.set(mapped);
    } else {
      this.error.set(
        err.code === 'opportunity_open'
          ? 'This client still has an open deal in Leads. Close it (won or lost) first.'
          : err.message,
      );
    }
  }
}
