import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { RouterOutlet } from '@angular/router';
import { CommandPalette } from '../command-palette/command-palette';
import { LayoutService } from '../layout.service';
import { Sidebar } from '../sidebar/sidebar';
import { Tabbar } from '../tabbar/tabbar';
import { Topbar } from '../topbar/topbar';

/**
 * >= 1024px: sidebar (256px expanded or 72px rail) + top bar + page.
 * < 1024px: top bar + page + bottom tab bar.
 * Shortcuts: Ctrl/Cmd+B toggles the sidebar, Ctrl/Cmd+K opens the command palette.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, Sidebar, Tabbar, Topbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  host: {
    '[style.--sidebar-w.px]': 'layout.sidebarWidth()',
    '[class.mobile]': '!layout.isDesktop()',
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class Shell {
  protected readonly layout = inject(LayoutService);
  private readonly dialog = inject(MatDialog);

  onKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'b' && this.layout.isDesktop()) {
      event.preventDefault();
      this.layout.toggleSidebar();
    } else if (key === 'k') {
      event.preventDefault();
      this.openPalette();
    }
  }

  openPalette(): void {
    if (this.dialog.openDialogs.some((d) => d.componentInstance instanceof CommandPalette)) {
      return;
    }
    this.dialog.open(CommandPalette, {
      width: '560px',
      maxWidth: 'calc(100vw - 32px)',
      position: { top: '12vh' },
      autoFocus: 'first-tabbable',
      ariaLabel: 'Search pages',
      panelClass: 'palette-panel',
    });
  }
}
