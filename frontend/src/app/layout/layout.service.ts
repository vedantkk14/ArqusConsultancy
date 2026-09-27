import { BreakpointObserver } from '@angular/cdk/layout';
import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

export const SIDEBAR_STORAGE_KEY = 'crm.sidebar.collapsed';
export const DESKTOP_QUERY = '(min-width: 1024px)';
export const WIDE_QUERY = '(min-width: 1280px)';
export const SIDEBAR_EXPANDED_PX = 256;
export const SIDEBAR_RAIL_PX = 72;

function readStored(): boolean | null {
  try {
    const value = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return value === null ? null : value === '1';
  } catch {
    return null;
  }
}

function writeStored(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    /* storage unavailable: state just won't persist */
  }
}

/** Shell layout state: sidebar collapse (desktop only), breakpoint and the page subtitle. */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly breakpoints = inject(BreakpointObserver);

  /** >= 1024px: sidebar (expanded or rail). Below: top bar + bottom tab bar. */
  readonly isDesktop = toSignal(this.breakpoints.observe(DESKTOP_QUERY).pipe(map((s) => s.matches)), {
    initialValue: this.breakpoints.isMatched(DESKTOP_QUERY),
  });

  /** First visit: expanded at >= 1280px, collapsed at 1024-1279px. Afterwards: the stored choice. */
  private readonly collapsedState = signal(readStored() ?? !this.breakpoints.isMatched(WIDE_QUERY));
  readonly collapsed = this.collapsedState.asReadonly();

  /** Width the content must leave for the sidebar, in px (0 on mobile). */
  readonly sidebarWidth = computed(() =>
    this.isDesktop() ? (this.collapsed() ? SIDEBAR_RAIL_PX : SIDEBAR_EXPANDED_PX) : 0,
  );

  /** Optional quiet line under the page title in the top bar. Pages set it and clear it on destroy. */
  readonly subtitle = signal('');

  /** Unread notifications (drives the bell dot). TODO(depends on notifications API, Dev C). */
  readonly unreadNotifications = signal(0);

  /** Count badges on sidebar sections, keyed by route (the dashboard fills them from its attention data). */
  readonly navBadges = signal<Record<string, { count: number; tone: 'rose' | 'amber' }>>({});

  toggleSidebar(): void {
    this.setCollapsed(!this.collapsed());
  }

  setCollapsed(collapsed: boolean): void {
    this.collapsedState.set(collapsed);
    writeStored(collapsed);
  }
}
