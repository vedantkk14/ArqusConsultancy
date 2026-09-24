import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ApiError } from '../../../../core/models';
import { ImportProblem, ImportReport } from '../../data/lead.models';
import { LeadsApi } from '../../data/leads-api.service';
import { DialogHead } from './dialog-head';

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

type Step = 'pick' | 'checking' | 'preview' | 'importing' | 'done';

/** Pick a file, see what would happen (preview), then import. Closes with the number of leads created. */
@Component({
  selector: 'app-import-dialog',
  imports: [DialogHead, MatButtonModule, MatDialogModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './dialog.scss',
  styles: `
    :host { width: min(640px, calc(100vw - 32px)); }
    .drop {
      display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 28px 16px; text-align: center;
      border: 2px dashed var(--line-strong); border-radius: var(--radius-card); color: var(--ink-2); cursor: pointer;
    }
    .drop.over, .drop:focus-within, .drop:hover { border-color: var(--brand-deep); background: var(--brand-tint); }
    .drop mat-icon { width: 32px; height: 32px; font-size: 32px; color: var(--brand-deep); }
    .drop strong { color: var(--ink); }
    .hint { color: var(--ink-3); font-size: var(--text-sm); }
    .tpl { margin-top: var(--space-3); }
    .file { display: flex; align-items: center; gap: 8px; margin-bottom: var(--space-4); color: var(--ink-2); font-size: var(--text-sm); overflow-wrap: anywhere; }
    .tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: var(--space-4); }
    .tile { padding: 12px; border-radius: var(--radius-control); background: var(--surface-2); }
    .tile b { display: block; font-size: var(--text-xl, 22px); font-weight: 600; }
    .tile span { color: var(--ink-3); font-size: var(--text-xs); }
    .tile.ok b { color: var(--tint-teal-ink); }
    .tile.warn b { color: var(--tint-amber-ink); }
    .tile.bad b { color: var(--negative); }
    h3 { margin: var(--space-4) 0 6px; font-size: var(--text-sm); }
    .list { max-height: 180px; margin: 0; padding: 0; overflow: auto; list-style: none; border: 1px solid var(--line); border-radius: var(--radius-control); }
    .list li { display: flex; gap: 10px; padding: 8px 10px; font-size: var(--text-sm); color: var(--ink-2); }
    .list li + li { border-top: 1px solid var(--line); }
    .list .r { flex: none; width: 56px; color: var(--ink-3); }
    .busy { display: flex; align-items: center; gap: 10px; padding: 28px 0; color: var(--ink-2); }
    .done { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 0 4px; text-align: center; }
    .done mat-icon { width: 40px; height: 40px; font-size: 40px; color: var(--tint-teal-ink); }
    .done strong { font-size: var(--text-lg); }
  `,
  template: `
    <app-dialog-head
      title="Import leads from Excel"
      subtitle="Create many leads at once from a spreadsheet. You'll see a preview first."
    />

    @switch (step()) {
      @case ('pick') {
        <label
          class="drop"
          [class.over]="over()"
          (dragover)="$event.preventDefault(); over.set(true)"
          (dragleave)="over.set(false)"
          (drop)="onDrop($event)"
        >
          <mat-icon aria-hidden="true">upload_file</mat-icon>
          <strong>Choose a file or drop it here</strong>
          <span class="hint">.xlsx or .csv, up to 2 MB and 1,000 rows. Name and Phone are required.</span>
          <input class="sr-only" type="file" accept=".xlsx,.csv" (change)="onPick($any($event.target).files?.[0])" />
        </label>
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        <button matButton type="button" class="tpl" (click)="template()"><mat-icon>download</mat-icon>Download the template</button>
        <div class="actions"><button matButton type="button" mat-dialog-close>Cancel</button></div>
      }
      @case ('checking') {
        <p class="busy" role="status"><mat-icon aria-hidden="true">hourglass_top</mat-icon>Checking {{ file()?.name }}…</p>
      }
      @case ('preview') {
        @if (report(); as r) {
          <p class="file"><mat-icon aria-hidden="true">description</mat-icon>{{ file()?.name }}</p>
          <div class="tiles">
            <div class="tile ok"><b>{{ r.ready }}</b><span>Ready to import</span></div>
            <div class="tile warn"><b>{{ r.duplicate_count }}</b><span>Duplicates (skipped)</span></div>
            <div class="tile bad"><b>{{ r.error_count }}</b><span>Rows with problems (skipped)</span></div>
          </div>
          @if (r.errors.length) {
            <h3>Rows with problems</h3>
            <ul class="list">@for (p of r.errors; track p.row) { <li><span class="r">Row {{ p.row }}</span><span>{{ label(p) }}</span></li> }</ul>
            @if (r.error_count > r.errors.length) { <p class="hint">And {{ r.error_count - r.errors.length }} more.</p> }
          }
          @if (r.duplicates.length) {
            <h3>Duplicates</h3>
            <ul class="list">@for (p of r.duplicates; track p.row) { <li><span class="r">Row {{ p.row }}</span><span>{{ label(p) }}</span></li> }</ul>
            @if (r.duplicate_count > r.duplicates.length) { <p class="hint">And {{ r.duplicate_count - r.duplicates.length }} more.</p> }
          }
          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
          <div class="actions">
            <button matButton type="button" (click)="reset()">Choose another file</button>
            <button matButton="filled" type="button" [disabled]="!r.ready" (click)="run()">
              Import {{ r.ready }} {{ r.ready === 1 ? 'lead' : 'leads' }}
            </button>
          </div>
        }
      }
      @case ('importing') {
        <p class="busy" role="status"><mat-icon aria-hidden="true">hourglass_top</mat-icon>Importing leads…</p>
      }
      @case ('done') {
        <div class="done" role="status">
          <mat-icon aria-hidden="true">check_circle</mat-icon>
          <strong>{{ report()?.created }} {{ report()?.created === 1 ? 'lead' : 'leads' }} imported</strong>
          @if (report()?.duplicate_count || report()?.error_count) {
            <span class="hint">{{ (report()?.duplicate_count ?? 0) + (report()?.error_count ?? 0) }} rows were skipped.</span>
          }
        </div>
        <div class="actions"><span></span><button matButton="filled" type="button" (click)="finish()">Done</button></div>
      }
    }
  `,
})
export class ImportDialog {
  private readonly api = inject(LeadsApi);
  private readonly ref = inject(MatDialogRef<ImportDialog, number>);

  protected readonly step = signal<Step>('pick');
  protected readonly file = signal<File | null>(null);
  protected readonly report = signal<ImportReport | null>(null);
  protected readonly error = signal('');
  protected readonly over = signal(false);

  protected label(p: ImportProblem): string {
    const who = [p.name, p.phone].filter(Boolean).join(' · ');
    return who ? `${who}: ${p.reason}` : p.reason;
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.over.set(false);
    this.onPick(event.dataTransfer?.files?.[0]);
  }

  protected onPick(file: File | undefined): void {
    if (!file) {
      return;
    }
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      this.error.set('Upload an Excel (.xlsx) or CSV file.');
      return;
    }
    if (file.size > IMPORT_MAX_BYTES) {
      this.error.set('The file is larger than 2 MB. Split it and import in parts.');
      return;
    }
    this.error.set('');
    this.file.set(file);
    this.step.set('checking');
    this.api.importFile(file, true).subscribe({
      next: (r) => {
        this.report.set(r);
        this.step.set('preview');
      },
      error: (e: ApiError) => this.fail(e),
    });
  }

  protected run(): void {
    const file = this.file();
    if (!file) {
      return;
    }
    this.error.set('');
    this.step.set('importing');
    this.api.importFile(file, false).subscribe({
      next: (r) => {
        this.report.set(r);
        this.step.set('done');
      },
      error: (e: ApiError) => {
        this.error.set(e.message);
        this.step.set('preview');
      },
    });
  }

  protected reset(): void {
    this.file.set(null);
    this.report.set(null);
    this.error.set('');
    this.step.set('pick');
  }

  protected finish(): void {
    this.ref.close(this.report()?.created ?? 0);
  }

  protected template(): void {
    this.api.importTemplate().subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leads-import-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  private fail(e: ApiError): void {
    const first = Object.values(e.details ?? {})[0];
    this.error.set(Array.isArray(first) ? String(first[0]) : e.message);
    this.step.set('pick');
  }
}
