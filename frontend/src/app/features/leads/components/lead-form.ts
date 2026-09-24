import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/models';
import {
  Assignee,
  DuplicateInfo,
  LEAD_SOURCES,
  LeadDetail,
  LeadInput,
  LeadSource,
  STATUS_LABELS,
} from '../data/lead.models';
import { LeadsApi } from '../data/leads-api.service';
import { atBusinessTime, formatBusiness, toBusinessInput, toBusinessIso } from '../utils/business-time';
import { localPart, normalizePhone } from '../utils/phone';

export const REQUIREMENTS_MAX = 500;

const phoneValidator = (control: AbstractControl): ValidationErrors | null =>
  !control.value || normalizePhone(toFullPhone(control.value)) ? null : { phone: true };

/** The +91 box holds the local part; a number typed with "+" is taken as international. */
export function toFullPhone(value: string): string {
  const text = (value ?? '').trim();
  return text.startsWith('+') ? text : `+91${text.replace(/\D/g, '')}`;
}

const FIELD_ORDER = ['name', 'phone', 'email', 'source', 'source_other', 'requirements', 'assigned_to', 'next_followup_at'];

export interface LeadFormSaved {
  lead: LeadDetail;
  addAnother: boolean;
}

/** Add / edit lead. Used by /leads/new and the "Edit lead" sheet on the detail page. */
@Component({
  selector: 'app-lead-form',
  imports: [MatButtonModule, MatIconModule, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lead-form.html',
  styleUrl: './lead-form.scss',
})
export class LeadForm {
  /** Edit mode when set. */
  readonly lead = input<LeadDetail | null>(null);
  /** Managers edit everything and assign; an exec edits only email and requirements. */
  readonly canAssign = input(false);
  readonly limited = input(false);
  readonly saved = output<LeadFormSaved>();
  readonly cancelled = output<void>();

  private readonly api = inject(LeadsApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly sources = LEAD_SOURCES;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly maxReq = REQUIREMENTS_MAX;
  protected readonly assignees = signal<Assignee[]>([]);
  protected readonly duplicate = signal<DuplicateInfo | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly submitted = signal(false);
  protected readonly followupChips = [
    { label: 'Today 5 pm', at: () => atBusinessTime(0, 17) },
    { label: 'Tomorrow 10 am', at: () => atBusinessTime(1, 10) },
    { label: 'In 3 days', at: () => atBusinessTime(3, 10) },
  ];

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    phone: ['', [Validators.required, phoneValidator]],
    email: ['', [Validators.email, Validators.maxLength(254)]],
    source: ['WEBSITE' as LeadSource],
    source_other: ['', Validators.maxLength(100)],
    requirements: ['', Validators.maxLength(REQUIREMENTS_MAX)],
    assigned_to: [''],
    next_followup_at: [''],
  });

  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly reqLength = computed(() => (this.values().requirements ?? '').length);
  protected readonly isOther = computed(() => this.values().source === 'OTHER');
  protected readonly followupPreview = computed(() => {
    const iso = toBusinessIso(this.values().next_followup_at ?? '');
    return iso ? formatBusiness(iso) : '';
  });
  protected readonly isEdit = computed(() => this.lead() !== null);

  ngOnInit(): void {
    const lead = this.lead();
    if (lead) {
      this.form.reset({
        name: lead.name,
        phone: localPart(lead.phone),
        email: lead.email,
        source: lead.source,
        source_other: lead.source_other,
        requirements: lead.requirements,
        assigned_to: lead.assigned_to ? String(lead.assigned_to.id) : '',
        next_followup_at: toBusinessInput(lead.next_followup_at),
      });
    }
    if (this.limited()) {
      for (const key of ['name', 'phone', 'source', 'source_other', 'assigned_to', 'next_followup_at'] as const) {
        this.form.controls[key].disable();
      }
    }
    if (this.canAssign() && !this.isEdit()) {
      this.api.assignees().subscribe({ next: (list) => this.assignees.set(list), error: () => undefined });
    }
  }

  get dirty(): boolean {
    return this.form.dirty;
  }

  protected showError(key: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[key];
    return control.invalid && (control.touched || this.submitted());
  }

  protected errorText(key: keyof typeof this.form.controls): string {
    const errors = this.form.controls[key].errors ?? {};
    if (errors['server']) return errors['server'];
    if (errors['required']) return key === 'name' ? "Enter the lead's name." : 'Enter a mobile number.';
    if (errors['phone']) return 'Enter a valid mobile number, e.g. 98765 43210.';
    if (errors['email']) return 'Enter a valid email address.';
    if (errors['maxlength']) return `Keep this under ${errors['maxlength'].requiredLength} characters.`;
    return 'Check this field.';
  }

  /** Paste-friendly: "+91 98765-43210" or "098765 43210" become "9876543210". */
  protected onPhonePaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    if (!text) {
      return;
    }
    event.preventDefault();
    this.form.controls.phone.setValue(localPart(text));
    this.form.controls.phone.markAsDirty();
  }

  protected checkDuplicate(): void {
    const control = this.form.controls.phone;
    control.markAsTouched();
    const full = normalizePhone(toFullPhone(control.value));
    if (!full || this.limited()) {
      this.duplicate.set(null);
      return;
    }
    this.api.checkDuplicate(full, this.lead()?.id).subscribe({
      next: (res) => this.duplicate.set(res.existing),
      error: () => this.duplicate.set(null),
    });
  }

  private readonly auth = inject(AuthService);
  protected readonly meId = computed(() => this.auth.user()?.id ?? null);
  protected readonly amAssignee = computed(() => this.assignees().some((a) => a.id === this.meId()));

  protected assignToMe(): void {
    this.form.controls.assigned_to.setValue(String(this.meId()));
    this.form.controls.assigned_to.markAsDirty();
  }

  protected setFollowup(iso: string): void {
    this.form.controls.next_followup_at.setValue(toBusinessInput(iso));
    this.form.controls.next_followup_at.markAsDirty();
  }

  protected autoPick(): void {
    const least = this.assignees()
      .filter((a) => a.role === 'SALES_EXEC')
      .sort((a, b) => a.open_count - b.open_count || a.name.localeCompare(b.name))[0];
    if (least) {
      this.form.controls.assigned_to.setValue(String(least.id));
      this.form.controls.assigned_to.markAsDirty();
    }
  }

  protected submit(addAnother = false): void {
    this.submitted.set(true);
    this.formError.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.focusFirstInvalid();
      return;
    }
    const v = this.form.getRawValue();
    const followup = v.next_followup_at ? toBusinessIso(v.next_followup_at) : null;
    const body: Partial<LeadInput> = this.limited()
      ? { email: v.email.trim(), requirements: v.requirements }
      : {
          name: v.name.trim(),
          phone: normalizePhone(toFullPhone(v.phone)) ?? v.phone,
          email: v.email.trim(),
          source: v.source,
          source_other: v.source === 'OTHER' ? v.source_other.trim() : '',
          requirements: v.requirements,
          next_followup_at: followup,
        };
    if (this.duplicate()) {
      body.force = true;
    }
    const lead = this.lead();
    const request = lead
      ? this.api.update(lead.id, body)
      : this.api.create({ ...(body as LeadInput), assigned_to: v.assigned_to ? Number(v.assigned_to) : null });
    this.saving.set(true);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.submitted.set(false);
        this.duplicate.set(null);
        this.form.markAsPristine();
        if (addAnother) {
          this.form.reset();
        }
        this.saved.emit({ lead: saved, addAnother });
      },
      error: (err: ApiError) => {
        this.saving.set(false);
        this.applyServerErrors(err);
      },
    });
  }

  private applyServerErrors(err: ApiError): void {
    if (err.code === 'duplicate_lead') {
      this.duplicate.set((err.details['existing'] as DuplicateInfo) ?? null);
      this.formError.set('This number is already a lead. Save again to add it anyway.');
      return;
    }
    let mapped = false;
    for (const [key, value] of Object.entries(err.details ?? {})) {
      const control = this.form.get(key);
      if (control && Array.isArray(value)) {
        control.setErrors({ server: String(value[0]) });
        control.markAsTouched();
        mapped = true;
      }
    }
    if (err.code === 'followup_in_past') {
      this.form.controls.next_followup_at.setErrors({ server: 'The follow-up must not be in the past.' });
      mapped = true;
    }
    if (!mapped) {
      this.formError.set(err.message);
    }
    this.focusFirstInvalid();
  }

  private focusFirstInvalid(): void {
    const key = FIELD_ORDER.find((k) => this.form.get(k)?.invalid);
    if (key) {
      queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>(`[formControlName="${key}"]`)?.focus());
    }
  }
}
