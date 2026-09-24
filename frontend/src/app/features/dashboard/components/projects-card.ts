import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InrCompactPipe } from '../../../shared/money/inr.pipe';
import { ProjectBurn } from '../dashboard.models';
import { PanelHead } from './panel-head';
import { SplitBar } from './split-bar';

const STATE_TEXT: Record<ProjectBurn['state'], string> = { ok: 'On track', warn: 'Near limit', over: 'Over budget' };

/** Running vs completed, then the top projects by budget burn (colour plus words, never colour alone). */
@Component({
  selector: 'app-projects-card',
  imports: [InrCompactPipe, PanelHead, RouterLink, SplitBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card panel', role: 'region', 'aria-labelledby': 'projects-title' },
  template: `
    <app-panel-head title="Projects" subtitle="Budget used, highest first" link="/projects/running" headingId="projects-title" />
    <p class="split"><b class="num">{{ running() }}</b> Running · <b class="num">{{ completed() }}</b> Completed</p>
    <app-split-bar [first]="running()" [second]="completed()" />
    <ul>
      @for (p of burn().slice(0, 5); track p.id) {
        <li>
          <a [routerLink]="['/projects', p.id]" [class]="p.state">
            <span class="top"><span class="nm">{{ p.name }}</span><span class="num">{{ p.pct }}%</span></span>
            <span class="track" aria-hidden="true"><span [style.width.%]="width(p.pct)"></span></span>
            <span class="sub"><span class="st">{{ stateText[p.state] }}</span><span class="num">{{ p.spent | inrCompact }} of {{ p.sanctioned | inrCompact }}</span></span>
          </a>
        </li>
      } @empty {
        <li class="none">No running projects</li>
      }
    </ul>
  `,
  styles: `
    .split { margin: 0 0 8px; color: var(--ink-2); font-size: var(--text-sm); }
    .split b { color: var(--ink); }
    ul { display: flex; flex-direction: column; gap: 2px; margin: 16px -8px 0; padding: 0; list-style: none; }
    a { display: flex; min-height: 44px; flex-direction: column; gap: 6px; padding: 8px; border-radius: var(--radius-sm); color: var(--ink); text-decoration: none; }
    a:hover { background: var(--surface-2); }
    .top, .sub { display: flex; justify-content: space-between; gap: 8px; font-size: var(--text-sm); }
    .nm { overflow: hidden; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
    .sub { color: var(--ink-3); font-size: var(--text-xs); }
    .track { height: 6px; overflow: hidden; border-radius: 999px; background: var(--plate); }
    .track span { display: block; height: 100%; background: var(--data-cyan); transform-origin: left; animation: fill 800ms var(--ease-out) both; }
    .warn .track span { background: var(--data-amber); }
    .over .track span { background: var(--data-rose); }
    .warn .st { color: var(--tint-amber-ink); font-weight: 600; }
    .over .st { color: var(--tint-rose-ink); font-weight: 600; }
    .none { padding: 8px; color: var(--ink-3); }
    @keyframes fill { from { transform: scaleX(0); } }
  `,
})
export class ProjectsCard {
  readonly running = input(0);
  readonly completed = input(0);
  readonly burn = input.required<ProjectBurn[]>();
  protected readonly stateText = STATE_TEXT;

  /** Bar geometry only. */
  protected width(pct: string): number {
    return Math.min(100, Number(pct) || 0);
  }
}
