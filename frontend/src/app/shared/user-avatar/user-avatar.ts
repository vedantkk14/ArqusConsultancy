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

/** Round cyan avatar with ink initials (ink on cyan is 9.7:1). */
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
      background: var(--brand);
      color: var(--ink);
      font-size: calc(var(--size, 36px) * 0.38);
      font-weight: 700;
      font-stretch: var(--font-wide);
      letter-spacing: 0.02em;
      line-height: 1;
    }
  `,
})
export class UserAvatar {
  readonly name = input.required<string>();
  readonly size = input(36);

  protected readonly text = computed(() => initials(this.name()));
}
