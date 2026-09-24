import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { passwordChecks } from './password-rules';

/** Requirements list under a new-password field; each line says whether it is met in words too. */
@Component({
  selector: 'app-password-checklist',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="checks" [attr.id]="listId()" aria-label="Password requirements">
      @for (check of checks(); track check.key) {
        <li [class.ok]="check.ok">
          <mat-icon aria-hidden="true">{{ check.ok ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
          <span>{{ check.label }}</span>
          <span class="sr-only">{{ check.ok ? '(met)' : '(not met yet)' }}</span>
        </li>
      }
    </ul>
  `,
  styles: `
    .checks {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
      font-size: var(--text-sm);
      color: var(--ink-3);
    }
    li {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    li.ok {
      color: var(--positive);
    }
    mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
  `,
})
export class PasswordChecklist {
  readonly value = input.required<string>();
  readonly listId = input<string | null>(null);
  protected readonly checks = computed(() => passwordChecks(this.value()));
}
