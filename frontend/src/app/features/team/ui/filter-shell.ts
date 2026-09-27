import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, inject, input, output, viewChild } from '@angular/core';
import { MatBottomSheet, MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * Filter row for list pages. Project the search box with `[search]` and the dropdowns with `[filters]`.
 * Wide: everything inline. Compact (phones): search stays, the dropdowns move into a bottom sheet under
 * one "Filters (n)" button. Shows "Clear filters" while any filter is active.
 */
@Component({
  selector: 'app-filter-shell',
  imports: [MatBottomSheetModule, MatButtonModule, MatIconModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row">
      <ng-content select="[search]" />
      @if (compact()) {
        <button type="button" class="more" (click)="open()">
          <mat-icon aria-hidden="true">tune</mat-icon>Filters{{ activeCount() ? ' (' + activeCount() + ')' : '' }}
        </button>
      } @else {
        <ng-container *ngTemplateOutlet="controls" />
      }
      @if (active()) {
        <button type="button" class="clear" (click)="cleared.emit()">Clear filters</button>
      }
    </div>

    <ng-template #controls><ng-content select="[filters]" /></ng-template>
    <ng-template #sheet>
      <div class="sheet">
        <h2>Filters</h2>
        <ng-container *ngTemplateOutlet="controls" />
        <div class="sheet-actions">
          <button matButton type="button" (click)="cleared.emit(); close()">Clear filters</button>
          <button matButton="filled" type="button" (click)="close()">Done</button>
        </div>
      </div>
    </ng-template>
  `,
  styles: `
    :host { display: block; }
    .row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; }
    .more, .clear {
      display: inline-flex; align-items: center; gap: 6px; height: 44px; padding: 0 12px; font: inherit; font-size: var(--text-sm); cursor: pointer;
    }
    .more { border: 1px solid var(--line-strong); border-radius: var(--radius-control); background: var(--surface); color: var(--ink); }
    .clear { border: 0; background: none; color: var(--brand-deep); font-weight: 500; }
    .clear:hover { text-decoration: underline; }
    .sheet { display: flex; flex-direction: column; gap: 12px; padding: 8px 4px calc(16px + env(safe-area-inset-bottom)); }
    .sheet h2 { margin: 0; font-size: var(--text-lg); }
    .sheet-actions { display: flex; justify-content: space-between; margin-top: 8px; }
  `,
})
export class FilterShell {
  readonly compact = input(false);
  readonly active = input(false);
  readonly activeCount = input(0);
  readonly cleared = output<void>();

  private readonly sheet = inject(MatBottomSheet);
  private readonly tpl = viewChild.required<TemplateRef<unknown>>('sheet');

  protected open(): void {
    this.sheet.open(this.tpl(), { ariaLabel: 'Filters' });
  }

  protected close(): void {
    this.sheet.dismiss();
  }
}
