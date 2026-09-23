import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { findNavItem } from '../../core/config/route-helpers';
import { SIDEBAR_CONFIG, filterNavByRole } from '../../core/config/sidebar.config';
import { ROLE_LABELS, Role } from '../../core/models';
import { BrandArt } from '../../shared/brand-art/brand-art';

/** One line per workspace, shown on its tile. */
const DESCRIPTIONS: Record<string, string> = {
  '/leads': 'Capture prospects, follow up and win deals.',
  '/projects': 'Turn won deals into projects and see them through.',
  '/accounts': 'Ledgers, payments and pending collections.',
  '/expenses': 'Track spend against each project budget.',
  '/reports': 'Sales, financial health and margin.',
  '/team': 'People, roles, commission and assignments.',
  '/communication': 'Templates, message log and notifications.',
  '/settings': 'Master data, audit log and your profile.',
};

/** The business flow. Each step links to the first candidate page the user's role may open. */
const FLOW = [
  { title: 'Lead', caption: 'A prospect enters the pipeline', pages: ['/leads/all'] },
  { title: 'Won deal', caption: 'The lead is won and finalised', pages: ['/leads/won-awaiting'] },
  { title: 'Project', caption: 'Delivery starts', pages: ['/projects/running'] },
  {
    title: 'Payments & expenses',
    caption: 'Money in, money out',
    pages: ['/accounts/payments', '/expenses/all'],
  },
  { title: 'Margin', caption: 'What the project earned', pages: ['/reports/project-margin'] },
];

@Component({
  selector: 'app-dashboard-page',
  imports: [BrandArt, MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  private readonly auth = inject(AuthService);

  protected readonly user = this.auth.user;
  protected readonly roleLabels = ROLE_LABELS;

  protected readonly greeting = (() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  })();

  protected readonly firstName = computed(() => this.user()?.name.split(' ')[0] ?? '');

  /** Workspaces the user's role can open (everything except the Dashboard itself). */
  protected readonly tiles = computed(() =>
    filterNavByRole(SIDEBAR_CONFIG, this.auth.role())
      .filter((item) => item.children?.length)
      .map((item) => ({
        label: item.label,
        icon: item.icon,
        description: DESCRIPTIONS[item.route] ?? '',
        pages: item.children?.length ?? 0,
        route: item.children?.[0].route ?? item.route,
      })),
  );

  protected readonly steps = computed(() => {
    const role = this.auth.role();
    return FLOW.map((step, index) => ({
      number: index + 1,
      title: step.title,
      caption: step.caption,
      route: step.pages.find((page) => canOpen(page, role)) ?? null,
    }));
  });
}

function canOpen(route: string, role: Role | null): boolean {
  return !!role && !!findNavItem(route)?.roles.includes(role);
}
