import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { NavPage, pagesForRole } from '../nav-helpers';

/** Case-insensitive match on the page label or its group. */
export function filterPages(pages: NavPage[], query: string): NavPage[] {
  const q = query.trim().toLowerCase();
  return q ? pages.filter((p) => `${p.label} ${p.group ?? ''}`.toLowerCase().includes(q)) : pages;
}

/** Ctrl/Cmd+K: jump to any page the user's role can open. */
@Component({
  selector: 'app-command-palette',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './command-palette.html',
  styleUrl: './command-palette.scss',
})
export class CommandPalette {
  private readonly router = inject(Router);
  private readonly dialogRef = inject(MatDialogRef<CommandPalette>);
  private readonly pages = pagesForRole(inject(AuthService).role());

  protected readonly query = signal('');
  protected readonly active = signal(0);
  protected readonly results = computed(() => filterPages(this.pages, this.query()));

  protected onInput(value: string): void {
    this.query.set(value);
    this.active.set(0);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.results().length;
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault();
      this.active.update((i) => (i + 1) % count);
    } else if (event.key === 'ArrowUp' && count) {
      event.preventDefault();
      this.active.update((i) => (i - 1 + count) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const page = this.results()[this.active()];
      if (page) {
        this.go(page);
      }
    }
  }

  protected go(page: NavPage): void {
    this.dialogRef.close();
    void this.router.navigateByUrl(page.route);
  }
}
