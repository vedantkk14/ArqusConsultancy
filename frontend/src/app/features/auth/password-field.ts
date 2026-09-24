import { ChangeDetectionStrategy, Component, ElementRef, computed, input, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

/**
 * Label + password input + show/hide toggle + Caps Lock hint + error slot (project `[fieldError]`).
 * Used by login, reset, change password.
 */
@Component({
  selector: 'app-password-field',
  imports: [MatIconModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="field">
      <label [for]="inputId()">{{ label() }}</label>
      <div class="control" [class.invalid]="invalid()">
        <input
          #input
          [id]="inputId()"
          [type]="visible() ? 'text' : 'password'"
          [formControl]="control()"
          [attr.autocomplete]="autocomplete()"
          [attr.enterkeyhint]="enterKeyHint()"
          [attr.aria-invalid]="invalid()"
          [attr.aria-describedby]="describedBy()"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          (keydown)="checkCaps($event)"
          (keyup)="checkCaps($event)"
          (blur)="capsLock.set(false)"
        />
        <button
          type="button"
          class="toggle"
          [attr.aria-pressed]="visible()"
          [attr.aria-label]="visible() ? 'Hide password' : 'Show password'"
          [attr.aria-controls]="inputId()"
          (click)="visible.set(!visible())"
        >
          <mat-icon aria-hidden="true">{{ visible() ? 'visibility_off' : 'visibility' }}</mat-icon>
        </button>
      </div>
      @if (capsLock()) {
        <p class="hint" [id]="inputId() + '-caps'">
          <mat-icon aria-hidden="true">keyboard_capslock</mat-icon>Caps Lock is on
        </p>
      }
      <ng-content select="[fieldError]" />
    </div>
  `,
  styleUrl: './auth-form.scss',
  styles: `
    .control {
      position: relative;
    }
    .control input {
      padding-right: 48px;
    }
    .toggle {
      position: absolute;
      top: 50%;
      right: 2px;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--ink-3);
      transform: translateY(-50%);
      cursor: pointer;
    }
    .toggle:hover {
      color: var(--ink);
    }
    .toggle mat-icon {
      width: 20px;
      height: 20px;
      font-size: 20px;
    }
    .hint {
      display: flex;
      align-items: center;
      gap: 4px;
      margin: 6px 0 0;
      color: var(--warning);
      font-size: var(--text-sm);
    }
    .hint mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
  `,
})
export class PasswordField {
  readonly control = input.required<FormControl<string>>();
  readonly inputId = input.required<string>();
  readonly label = input.required<string>();
  readonly autocomplete = input<'current-password' | 'new-password'>('current-password');
  readonly enterKeyHint = input<'go' | 'next' | 'done'>('go');
  readonly invalid = input(false);
  /** Ids of error/help elements that describe this field. */
  readonly errorId = input<string | null>(null);

  protected readonly visible = signal(false);
  protected readonly capsLock = signal(false);
  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected readonly describedBy = computed(
    () =>
      [this.invalid() ? this.errorId() : null, this.capsLock() ? `${this.inputId()}-caps` : null]
        .filter(Boolean)
        .join(' ') || null,
  );

  focus(): void {
    this.inputRef().nativeElement.focus();
  }

  protected checkCaps(event: KeyboardEvent): void {
    if (typeof event.getModifierState === 'function') {
      this.capsLock.set(event.getModifierState('CapsLock'));
    }
  }
}
