import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Two-letter initials of a name, e.g. "Alice Admin" -> "AA". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}

/** Round avatar: ink initials on the cyan tint. Decorative; the name is always shown or labelled nearby. */
@Component({
  selector: 'app-user-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="avatar" [style.--size.px]="size()" aria-hidden="true">{{ text() }}</span>`,
  styles: `
    .avatar {
      display: inline-grid;
      place-items: center;
      width: var(--size, 36px);
      height: var(--size, 36px);
      flex: none;
      border-radius: 50%;
      background: var(--brand-tint);
      box-shadow: inset 0 0 0 1px rgba(8, 111, 146, 0.18);
      color: var(--ink);
      font-size: calc(var(--size, 36px) * 0.36);
      font-weight: 600;
      line-height: 1;
    }
  `,
})
export class UserAvatar {
  readonly name = input.required<string>();
  readonly size = input(36);

  protected readonly text = computed(() => initials(this.name()));
}
