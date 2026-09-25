import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Passwords have no strength rules: any non-empty password is accepted. Only the confirmation must match. */
/** Form-level validator: `confirm` must equal `password`. Sets `mismatch` on the group. */
export function matchValidator(password: string, confirm: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const a = group.get(password)?.value;
    const b = group.get(confirm)?.value;
    return a && b && a !== b ? { mismatch: true } : null;
  };
}
