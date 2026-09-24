import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ApiError } from '../../../core/models';
import { formatInr, InrPipe } from '../../../shared/money/inr.pipe';
import { EXPENSE_CATEGORIES, Expense, ExpenseCategory, ExpenseInput } from '../data/project.models';
import { ProjectsApi } from '../data/projects-api.service';
import { businessDate } from '../ui/business-time';
import { MoneyInput, isPositiveMoney } from '../ui/money-input';
import { fieldError } from '../ui/open';

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const BACKDATE_DAYS = 30;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const ALLOWED_EXT = /\.(jpe?g|png|webp|pdf)$/i;

type FieldKey = 'amount' | 'category' | 'spent_on' | 'vendor' | 'description' | 'receipt' | 'override_reason';
const FIELD_IDS: Record<FieldKey, string> = {
  amount: 'ae-amount',
  category: 'ae-cat-MATERIALS',
  spent_on: 'ae-date',
  vendor: 'ae-vendor',
  description: 'ae-desc',
  receipt: 'ae-receipt',
  override_reason: 'ae-override-reason',
};
const ORDER: FieldKey[] = ['amount', 'category', 'spent_on', 'vendor', 'description', 'receipt', 'override_reason'];

/** Client-side receipt check (the server validates the real file type by its bytes). */
export function receiptProblem(file: { name: string; type: string; size: number }): string {
  if (!(ALLOWED.includes(file.type) || (!file.type && ALLOWED_EXT.test(file.name)))) {
    return 'Upload a JPG, PNG, WebP or PDF receipt.';
  }
  return file.size > MAX_RECEIPT_BYTES ? 'The receipt is larger than 5 MB.' : '';
}

export interface ExpenseProject {
  id: number;
  name: string;
  remaining: string;
}

/**
 * Add (or edit) an expense. Shown in a dialog on desktop and a bottom sheet on phones. The amount, date and
 * receipt are checked here first; the server has the last word (over-budget, receipt type, completed project).
 */
@Component({
  selector: 'app-add-expense-form',
  imports: [FormsModule, InrPipe, MatButtonModule, MatIconModule, MoneyInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.in-sheet]': 'inSheet()' },
  styleUrl: '../ui/dialog.scss',
  templateUrl: './add-expense-form.html',
  styles: `
    .cats { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; border: 0; }
    .cat { position: relative; }
    .cat input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
    .cat span {
      display: inline-flex; align-items: center; min-height: 40px; padding: 0 14px; border: 1px solid var(--line);
      border-radius: var(--radius-pill); background: var(--surface); color: var(--ink-2); font-size: var(--text-sm);
      transition: background-color var(--dur-fast), border-color var(--dur-fast);
    }
    .cat:hover span { border-color: var(--line-strong); }
    .cat input:checked + span { border-color: var(--ink); background: var(--ink); color: var(--on-ink); font-weight: 600; }
    .cat input:focus-visible + span { outline: 2px solid var(--brand-deep); outline-offset: 2px; box-shadow: var(--ring); }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
    .remaining { margin: 0 0 var(--space-4); padding: 8px 12px; border-radius: var(--radius-control); background: var(--subtle); color: var(--ink-2); font-size: var(--text-sm); }
    .remaining strong { color: var(--ink); }
    .count { align-self: flex-end; color: var(--ink-3); font-size: var(--text-xs); }
    .pick { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .pick button, .rm {
      display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px; border: 1px solid var(--line-strong);
      border-radius: var(--radius-control); background: var(--surface); color: var(--ink); font: inherit; font-size: var(--text-sm); cursor: pointer;
    }
    .pick button:hover, .rm:hover { background: var(--subtle); }
    .picked { display: flex; align-items: center; gap: var(--space-3); padding: 8px; border: 1px solid var(--line); border-radius: var(--radius-control); }
    .picked img { width: 56px; height: 56px; border-radius: 8px; object-fit: cover; }
    .picked .pdf { display: grid; width: 56px; height: 56px; place-items: center; border-radius: 8px; background: var(--tint-rose); color: var(--tint-rose-ink); }
    .picked .nm { flex: 1; min-width: 0; color: var(--ink-2); font-size: var(--text-sm); overflow-wrap: anywhere; }
    .rm { min-height: 40px; }
    .override { margin-bottom: var(--space-4); padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--tint-amber); }
    .override .sw { display: flex; align-items: center; gap: 10px; color: var(--tint-amber-ink); font-weight: 600; }
    .override input[type='checkbox'] { width: 20px; height: 20px; accent-color: var(--ink); }
    .override .field { margin: 12px 0 0; }
    .prog { height: 6px; overflow: hidden; border-radius: var(--radius-pill); background: var(--plate); }
    .prog span { display: block; height: 100%; background: var(--data-cyan); transform-origin: left; transition: transform var(--dur-base); }
    @media (max-width: 480px) { .row2 { grid-template-columns: 1fr; } }
  `,
})
export class AddExpenseForm implements OnInit {
  readonly project = input.required<ExpenseProject>();
  /** Set to edit an existing expense. */
  readonly expense = input<Expense | null>(null);
  readonly isAdmin = input(false);
  readonly inSheet = input(false);
  readonly saved = output<Expense>();
  readonly cancelled = output<void>();

  private readonly api = inject(ProjectsApi);

  protected readonly categories = EXPENSE_CATEGORIES;
  protected readonly today = businessDate(0);
  protected readonly earliest = businessDate(BACKDATE_DAYS);

  protected amount = '';
  protected readonly category = signal<ExpenseCategory>('MATERIALS');
  protected spentOn = this.today;
  protected vendor = '';
  protected description = '';
  protected overrideReason = '';
  protected readonly override = signal(false);

  protected readonly file = signal<File | null>(null);
  protected readonly preview = signal<string | null>(null);
  protected readonly errors = signal<Partial<Record<FieldKey, string>>>({});
  protected readonly error = signal('');
  protected readonly saving = signal(false);
  protected readonly progress = signal<number | null>(null);
  /** Set when the server says this expense would go over budget. */
  protected readonly overRemaining = signal<string | null>(null);
  protected readonly editing = computed(() => this.expense() !== null);
  protected readonly receiptOptional = computed(() => this.category() === 'LABOUR');
  protected readonly overMessage = computed(() => {
    const left = this.overRemaining();
    return left === null ? '' : `This exceeds the remaining budget of ${formatInr(left)}.`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearPreview());
  }

  ngOnInit(): void {
    const e = this.expense();
    if (e) {
      this.amount = e.amount;
      this.category.set(e.category);
      this.spentOn = e.spent_on;
      this.vendor = e.vendor;
      this.description = e.description;
    }
  }

  // ---- Receipt ------------------------------------------------------------------------------------

  protected onFile(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = ''; // picking the same file again must still fire
    if (!file) {
      return;
    }
    const problem = receiptProblem(file);
    this.setError('receipt', problem);
    if (problem) {
      return;
    }
    this.clearPreview();
    this.file.set(file);
    this.preview.set(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
  }

  protected removeFile(): void {
    this.clearPreview();
    this.file.set(null);
    this.setError('receipt', '');
  }

  private clearPreview(): void {
    const url = this.preview();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.preview.set(null);
  }

  private setError(key: FieldKey, message: string): void {
    this.errors.update((errors) => ({ ...errors, [key]: message }));
  }

  // ---- Submit -------------------------------------------------------------------------------------

  protected submit(): void {
    if (this.saving()) {
      return; // ignore double taps
    }
    const errors = this.validate();
    this.errors.set(errors);
    if (this.focusFirst(errors)) {
      return;
    }
    this.saving.set(true);
    this.progress.set(0);
    this.error.set('');
    if (!this.override()) {
      this.overRemaining.set(null); // the server says again if it is still over
    }
    const input: ExpenseInput = {
      amount: this.amount,
      category: this.category(),
      spent_on: this.spentOn,
      vendor: this.vendor.trim(),
      description: this.description.trim(),
      receipt: this.file(),
      ...(this.override() ? { admin_override: true, override_reason: this.overrideReason.trim() } : {}),
    };
    const editing = this.expense();
    const request = editing ? this.api.updateExpense(editing.id, input) : this.api.addExpense(this.project().id, input);
    request.subscribe({
      next: (event) => {
        if (event.kind === 'progress') {
          this.progress.set(event.percent);
        } else {
          this.saving.set(false);
          this.saved.emit(event.expense);
        }
      },
      error: (err: ApiError) => {
        this.saving.set(false);
        this.progress.set(null);
        this.fail(err);
      },
    });
  }

  private validate(): Partial<Record<FieldKey, string>> {
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!isPositiveMoney(this.amount)) {
      errors.amount = 'Enter the amount.';
    }
    if (!this.spentOn) {
      errors.spent_on = 'Choose the date.';
    } else if (this.spentOn > this.today) {
      errors.spent_on = 'The date cannot be in the future.';
    } else if (this.spentOn < this.earliest) {
      errors.spent_on = `The date cannot be more than ${BACKDATE_DAYS} days ago.`;
    }
    const kept = this.editing() && this.expense()?.has_receipt;
    if (!this.file() && !kept && !this.receiptOptional()) {
      errors.receipt = 'Attach a receipt for this expense.';
    }
    if (this.override() && !this.overrideReason.trim()) {
      errors.override_reason = 'Give a reason for going over budget.';
    }
    return errors;
  }

  private fail(err: ApiError): void {
    if (err.code === 'over_budget') {
      this.overRemaining.set(String(err.details['remaining'] ?? '0.00'));
      return;
    }
    const mapped: Partial<Record<FieldKey, string>> = {};
    for (const key of ORDER) {
      const message = fieldError(err, key);
      if (message) {
        mapped[key] = message;
      }
    }
    if (err.code === 'invalid_receipt') {
      mapped.receipt = err.message;
    }
    if (Object.keys(mapped).length) {
      this.errors.set(mapped);
      this.focusFirst(mapped);
    } else {
      this.error.set(err.message);
    }
  }

  /** Focus the first invalid field (in form order); true when there was one. */
  private focusFirst(errors: Partial<Record<FieldKey, string>>): boolean {
    const first = ORDER.find((key) => errors[key]);
    if (!first) {
      return false;
    }
    const id = first === 'category' ? `ae-cat-${this.category()}` : FIELD_IDS[first];
    document.getElementById(id)?.focus();
    return true;
  }
}
