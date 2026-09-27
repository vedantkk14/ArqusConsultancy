import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { LeadStatus, STATUS_LABELS } from '../data/lead.models';

const TRACK: LeadStatus[] = ['NEW', 'CONTACTED', 'INTERESTED', 'WON'];

/**
 * New -> Contacted -> Interested -> Won, with Lost as a separate end state. Display plus a shortcut:
 * a step is a button only when the API lists it in `allowed_transitions` (rules never hard-coded here).
 */
@Component({
  selector: 'app-stage-stepper',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="track" aria-label="Stage">
      @for (s of steps(); track s.status; let i = $index) {
        <li [class]="'st ' + s.state">
          @if (s.allowed) {
            <button type="button" class="dot-b" (click)="pick.emit(s.status)" [attr.aria-label]="'Move to ' + s.label">
              <span class="dot" aria-hidden="true">{{ i + 1 }}</span><span class="lbl">{{ s.label }}</span>
            </button>
          } @else {
            <span class="dot-b" [attr.aria-current]="s.state === 'current' ? 'step' : null">
              <span class="dot" aria-hidden="true">
                @if (s.state === 'done') {
                  <mat-icon>check</mat-icon>
                } @else {
                  {{ i + 1 }}
                }
              </span>
              <span class="lbl">{{ s.label }}<span class="sr-only">{{ stateText(s.state) }}</span></span>
            </span>
          }
        </li>
      }
      <li [class]="'st lost ' + (status() === 'LOST' ? 'current' : 'todo')">
        @if (lostAllowed()) {
          <button type="button" class="dot-b" (click)="pick.emit('LOST')" aria-label="Mark as Lost">
            <span class="dot" aria-hidden="true"><mat-icon>close</mat-icon></span><span class="lbl">Lost</span>
          </button>
        } @else {
          <span class="dot-b" [attr.aria-current]="status() === 'LOST' ? 'step' : null">
            <span class="dot" aria-hidden="true"><mat-icon>close</mat-icon></span><span class="lbl">Lost</span>
          </span>
        }
      </li>
    </ol>
  `,
  styles: `
    :host { position: relative; display: block; overflow-x: auto; scrollbar-width: none; } /* relative: keeps the absolute sr-only labels inside the scroll box */
    .track { display: flex; align-items: center; min-width: max-content; margin: 0; padding: 4px 2px; list-style: none; }
    .st { display: flex; align-items: center; }
    .st:not(:last-child)::after { width: 32px; height: 2px; margin: 0 6px; border-radius: 2px; background: var(--line); content: ''; }
    .st.done::after { background: var(--brand-deep); }
    .st.lost { margin-left: 12px; padding-left: 12px; border-left: 1px dashed var(--line-strong); }
    .dot-b {
      display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 10px 0 4px;
      border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--ink-3); font: inherit; font-size: var(--text-sm);
    }
    button.dot-b { cursor: pointer; }
    button.dot-b:hover { background: var(--subtle); color: var(--ink); }
    .dot {
      display: grid; width: 28px; height: 28px; place-items: center; border: 2px solid var(--line-strong);
      border-radius: 50%; background: var(--surface); font-size: var(--text-xs); font-weight: 600;
    }
    .dot mat-icon { width: 16px; height: 16px; font-size: 16px; }
    .done .dot { border-color: var(--brand-deep); background: var(--brand-deep); color: var(--on-ink); }
    .done .dot-b { color: var(--ink-2); }
    .current .dot { border-color: var(--ink); background: var(--ink); color: var(--on-ink); box-shadow: var(--ring); }
    .current .dot-b { color: var(--ink); font-weight: 600; }
    .lost.current .dot { border-color: var(--negative); background: var(--negative); box-shadow: none; }
    button.dot-b .dot { border-style: dashed; border-color: var(--brand-deep); color: var(--brand-deep); }
  `,
})
export class StageStepper {
  readonly status = input.required<LeadStatus>();
  readonly allowed = input<LeadStatus[]>([]);
  readonly pick = output<LeadStatus>();

  protected readonly lostAllowed = computed(() => this.allowed().includes('LOST'));
  protected readonly steps = computed(() => {
    const status = this.status();
    const at = TRACK.indexOf(status);
    return TRACK.map((s, i) => ({
      status: s,
      label: STATUS_LABELS[s],
      allowed: this.allowed().includes(s),
      state: status === 'LOST' ? 'todo' : i < at ? 'done' : i === at ? 'current' : 'todo',
    }));
  });

  protected stateText(state: string): string {
    return state === 'done' ? ' (done)' : state === 'current' ? ' (current stage)' : '';
  }
}
