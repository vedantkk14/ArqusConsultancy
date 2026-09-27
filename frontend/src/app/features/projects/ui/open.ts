import { MatDialogConfig } from '@angular/material/dialog';
import { ApiError } from '../../../core/models';

/** Every dialog head uses this id, so Material can name the dialog from its visible title. */
export const DIALOG_TITLE_ID = 'dlg-title';

export function dialogConfig<D>(data: D, extra: Partial<MatDialogConfig<D>> = {}): MatDialogConfig<D> {
  return { data, ariaLabelledBy: DIALOG_TITLE_ID, autoFocus: 'first-tabbable', ...extra };
}

/** First message of a field error from the API's `details`, e.g. details.reason = ["Required."]. */
export function fieldError(err: ApiError, field: string): string {
  const value = err.details?.[field];
  return Array.isArray(value) ? String(value[0] ?? '') : typeof value === 'string' ? value : '';
}
