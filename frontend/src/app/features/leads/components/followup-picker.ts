import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { atBusinessTime, formatBusiness, nextMonday, toBusinessInput, toBusinessIso } from '../utils/business-time';

export const DEFAULT_TIME = '10:00';

/** Time buttons: the hour is fixed with one tap, and any other time can be typed. */
export const TIME_CHOICES = [
  { value: '09:00', label: '9 am' },
  { value: '11:00', label: '11 am' },
  { value: '14:00', label: '2 pm' },
  { value: '16:00', label: '4 pm' },
  { value: '18:00', label: '6 pm' },
];

/** "2026-09-24T14:00" -> { date: "2026-09-24", time: "14:00" } (an IST wall time, as datetime-local). */
export function splitLocal(value: string | null | undefined): { date: string; time: string } {
  const [date = '', time = ''] = (value ?? '').split('T');
  return { date, time: time.slice(0, 5) };
}

/** Both parts -> the local string; a date without a time takes DEFAULT_TIME. */
export function joinLocal(date: string, time: string): string {
  return date ? `${date}T${time || DEFAULT_TIME}` : '';
}

/**
 * Follow-up date and time in IST. Value is the same "YYYY-MM-DDTHH:mm" string a datetime-local input
 * gives, so callers keep using toBusinessIso(). Quick buttons set both; time buttons fix the hour.
 */
@Component({
  selector: 'app-followup-picker',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FollowupPicker), multi: true }],
  templateUrl: './followup-picker.html',
  styleUrl: './followup-picker.scss',
})
export class FollowupPicker implements ControlValueAccessor {
  readonly inputId = input('fp');
  readonly invalid = input(false);

  protected readonly date = signal('');
  protected readonly time = signal('');
  protected readonly disabled = signal(false);
  protected readonly times = TIME_CHOICES;
  protected readonly minDate = toBusinessInput(new Date().toISOString()).slice(0, 10);
  protected readonly quick = [
    { label: 'Tomorrow', at: () => atBusinessTime(1, 10) },
    { label: 'In 3 days', at: () => atBusinessTime(3, 10) },
    { label: 'Next Monday', at: () => nextMonday(10) },
  ];

  protected readonly preview = computed(() => {
    const iso = toBusinessIso(joinLocal(this.date(), this.time()));
    return iso ? formatBusiness(iso) : '';
  });
  protected readonly customTime = computed(() => !!this.time() && !TIME_CHOICES.some((t) => t.value === this.time()));

  private onChange: (value: string) => void = () => undefined;
  protected touched: () => void = () => undefined;

  writeValue(value: string | null): void {
    const { date, time } = splitLocal(value);
    this.date.set(date);
    this.time.set(date ? time || DEFAULT_TIME : '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.touched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected setDate(date: string): void {
    this.date.set(date);
    if (date && !this.time()) {
      this.time.set(DEFAULT_TIME);
    }
    this.emit();
  }

  protected setTime(time: string): void {
    this.time.set(time);
    this.emit();
  }

  protected setQuick(iso: string): void {
    const { date, time } = splitLocal(toBusinessInput(iso));
    this.date.set(date);
    this.time.set(time);
    this.emit();
  }

  protected clear(): void {
    this.date.set('');
    this.time.set('');
    this.emit();
  }

  private emit(): void {
    this.onChange(joinLocal(this.date(), this.time()));
    this.touched();
  }
}
