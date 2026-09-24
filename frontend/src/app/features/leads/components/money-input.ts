import { ChangeDetectionStrategy, Component, ElementRef, forwardRef, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { groupIndian } from '../../../shared/money/inr.pipe';

export const MONEY_MAX_WHOLE_DIGITS = 10; // DecimalField(12, 2): 10 + 2 = 12 digits

/**
 * Text typed into a ₹ field -> the API string and the grouped display. Pure string work, no floats:
 * "1234567.5" -> { value: "1234567.5", display: "12,34,567.5" }. Extra digits are dropped.
 */
export function parseMoneyInput(text: string): { value: string; display: string } {
  const cleaned = (text ?? '').replace(/[^\d.]/g, '');
  const [wholeRaw = '', ...rest] = cleaned.split('.');
  const hasDot = cleaned.includes('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '').slice(0, MONEY_MAX_WHOLE_DIGITS);
  const frac = rest.join('').slice(0, 2);
  const value = whole || hasDot ? `${whole || '0'}${hasDot ? '.' + frac : ''}` : '';
  const display = value ? `${groupIndian(whole || '0')}${hasDot ? '.' + frac : ''}` : '';
  return { value, display };
}

/** True for a positive amount ("0", "0.00" and "" are not). */
export function isPositiveMoney(value: string | null | undefined): boolean {
  return /[1-9]/.test(value ?? '');
}

/** ₹ amount field: Indian digit grouping while typing, string value, at most 12 digits. */
@Component({
  selector: 'app-money-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MoneyInput), multi: true }],
  template: `
    <span class="wrap" [class.invalid]="invalid()">
      <span class="prefix" aria-hidden="true">₹</span>
      <input
        #box
        type="text"
        inputmode="decimal"
        autocomplete="off"
        [id]="inputId()"
        [attr.aria-describedby]="describedBy()"
        [attr.aria-invalid]="invalid() || null"
        [value]="display()"
        [disabled]="disabled()"
        (input)="onInput(box.value)"
        (blur)="touched()"
      />
    </span>
  `,
  styles: `
    .wrap {
      display: flex;
      align-items: center;
      height: 44px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-control);
      background: var(--surface);
    }
    .wrap:focus-within { outline: 2px solid var(--brand-deep); outline-offset: 1px; box-shadow: var(--ring); }
    .wrap.invalid { border-color: var(--negative); }
    .prefix { padding: 0 4px 0 12px; color: var(--ink-3); font-weight: 500; }
    input {
      flex: 1;
      min-width: 0;
      height: 100%;
      padding: 0 12px 0 2px;
      border: 0;
      background: transparent;
      color: var(--ink);
      font: inherit;
      font-variant-numeric: tabular-nums;
      outline: none;
    }
  `,
})
export class MoneyInput implements ControlValueAccessor {
  readonly inputId = input<string>('');
  readonly describedBy = input<string | null>(null);
  readonly invalid = input(false);

  protected readonly display = signal('');
  protected readonly disabled = signal(false);
  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('box');
  private onChange: (value: string) => void = () => undefined;
  protected touched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.display.set(parseMoneyInput(value ?? '').display);
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

  focus(): void {
    this.box().nativeElement.focus();
  }

  protected onInput(text: string): void {
    const { value, display } = parseMoneyInput(text);
    this.display.set(display);
    this.box().nativeElement.value = display; // keep the field in step even when the text is unchanged
    this.onChange(value);
  }
}
