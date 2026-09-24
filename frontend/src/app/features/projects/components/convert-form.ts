import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { ApiError } from '../../../core/models';
import { InrPipe } from '../../../shared/money/inr.pipe';
import { ConvertibleLead, Manager, ProjectDetail } from '../data/project.models';
import { ProjectsApi } from '../data/projects-api.service';
import { MoneyInput, isPositiveMoney } from '../ui/money-input';
import { fieldError } from '../ui/open';

type FieldKey = 'name' | 'sanctioned_budget' | 'pm' | 'start_date' | 'expected_end_date' | 'scope';
const FIELD_IDS: Record<FieldKey, string> = {
  name: 'cv-name',
  sanctioned_budget: 'cv-budget',
  pm: 'cv-pm',
  start_date: 'cv-start',
  expected_end_date: 'cv-end',
  scope: 'cv-scope',
};
const ORDER: FieldKey[] = ['name', 'sanctioned_budget', 'pm', 'start_date', 'expected_end_date', 'scope'];

/** The convert panel's form: name, budget (suggested 60%), manager, dates and scope. */
@Component({
  selector: 'app-convert-form',
  imports: [FormsModule, InrPipe, MatButtonModule, MoneyInput, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.in-sheet]': 'inSheet()' },
  styleUrl: '../ui/dialog.scss',
  template: `
    <form (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="cv-name">Project name</label>
        <input id="cv-name" name="name" type="text" maxlength="200" autocomplete="off" [(ngModel)]="name" [attr.aria-invalid]="errors().name ? true : null" [attr.aria-describedby]="errors().name ? 'cv-name-err' : null" />
        @if (errors().name) {
          <p class="error" id="cv-name-err">{{ errors().name }}</p>
        }
      </div>

      <div class="field">
        <label for="cv-budget">Sanctioned budget</label>
        <app-money-input
          inputId="cv-budget"
          name="budget"
          [(ngModel)]="budget"
          [invalid]="!!errors().sanctioned_budget"
          [describedBy]="'cv-budget-hint' + (errors().sanctioned_budget ? ' cv-budget-err' : '')"
        />
        <p class="hint" id="cv-budget-hint">
          @if (lead().total_amount) {
            Cannot exceed {{ lead().total_amount | inr }}.
          }
          @if (lead().suggested_budget) {
            Suggested: {{ lead().suggested_budget | inr }} (60% of the deal).
          }
        </p>
        @if (errors().sanctioned_budget) {
          <p class="error" id="cv-budget-err">{{ errors().sanctioned_budget }}</p>
        }
      </div>

      <div class="field">
        <label for="cv-pm">Project manager</label>
        <select id="cv-pm" name="pm" [(ngModel)]="pm">
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
          <label for="cv-start">Start date</label>
          <input id="cv-start" name="start" type="date" [(ngModel)]="start" />
          @if (errors().start_date) {
            <p class="error">{{ errors().start_date }}</p>
          }
        </div>
        <div class="field">
          <label for="cv-end">Expected end date</label>
          <input id="cv-end" name="end" type="date" [(ngModel)]="end" [attr.aria-invalid]="errors().expected_end_date ? true : null" />
          @if (errors().expected_end_date) {
            <p class="error">{{ errors().expected_end_date }}</p>
          }
        </div>
      </div>

      <div class="field">
        <label for="cv-scope">Scope (optional)</label>
        <textarea id="cv-scope" name="scope" maxlength="2000" [(ngModel)]="scope"></textarea>
      </div>

      @if (exists()) {
        <p class="note warn" role="alert">
          This deal is already a project.
          <a [routerLink]="['/projects', exists()]">Open project</a>
        </p>
      } @else if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button matButton type="button" (click)="cancelled.emit()">Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving()">{{ saving() ? 'Creating…' : 'Create project' }}</button>
      </div>
    </form>
  `,
  styles: `
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
    @media (max-width: 480px) { .row2 { grid-template-columns: 1fr; } }
    a { color: var(--brand-deep); font-weight: 500; }
  `,
})
export class ConvertForm implements OnInit {
  readonly lead = input.required<ConvertibleLead>();
  readonly managers = input<Manager[]>([]);
  readonly inSheet = input(false);
  readonly converted = output<ProjectDetail>();
  readonly cancelled = output<void>();

  private readonly api = inject(ProjectsApi);

  protected name = '';
  protected budget = '';
  protected pm = '';
  protected start = '';
  protected end = '';
  protected scope = '';
  private seeded = false;

  protected readonly saving = signal(false);
  protected readonly errors = signal<Partial<Record<FieldKey, string>>>({});
  protected readonly error = signal('');
  protected readonly exists = signal<number | null>(null);

  ngOnInit(): void {
    if (!this.seeded) {
      const lead = this.lead();
      this.name = lead.name;
      this.budget = lead.suggested_budget ?? '';
      this.seeded = true;
    }
  }

  protected submit(): void {
    if (this.saving()) {
      return;
    }
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!this.name.trim()) {
      errors.name = 'Enter a project name.';
    }
    if (!isPositiveMoney(this.budget)) {
      errors.sanctioned_budget = 'Enter the sanctioned budget.';
    }
    if (this.start && this.end && this.end < this.start) {
      errors.expected_end_date = 'The end date cannot be before the start date.';
    }
    this.errors.set(errors);
    if (this.focusFirst(errors)) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.exists.set(null);
    this.api
      .convert({
        lead: this.lead().lead,
        name: this.name.trim(),
        sanctioned_budget: this.budget,
        pm: this.pm ? Number(this.pm) : null,
        start_date: this.start || null,
        expected_end_date: this.end || null,
        scope: this.scope.trim(),
      })
      .subscribe({
        next: (project) => this.converted.emit(project),
        error: (err: ApiError) => {
          this.saving.set(false);
          this.fail(err);
        },
      });
  }

  private fail(err: ApiError): void {
    if (err.code === 'project_exists') {
      this.exists.set(Number(err.details['project_id']) || null);
      return;
    }
    const mapped: Partial<Record<FieldKey, string>> = {};
    for (const key of ORDER) {
      const message = fieldError(err, key);
      if (message) {
        mapped[key] = message;
      }
    }
    if (err.code === 'budget_exceeds_total') {
      mapped.sanctioned_budget = err.message;
    }
    if (Object.keys(mapped).length) {
      this.errors.set(mapped);
      this.focusFirst(mapped);
    } else {
      this.error.set(
        err.code === 'not_finalized' ? 'This deal is not finalized in accounts yet.' : err.message,
      );
    }
  }

  /** Focus the first invalid field (in form order); true when there was one. */
  private focusFirst(errors: Partial<Record<FieldKey, string>>): boolean {
    const first = ORDER.find((key) => errors[key]);
    if (!first) {
      return false;
    }
    document.getElementById(FIELD_IDS[first])?.focus();
    return true;
  }
}
