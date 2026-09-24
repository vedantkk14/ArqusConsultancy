import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** A few of the most common passwords, for instant feedback. The server checks a list of ~20,000. */
const VERY_COMMON = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwertyuiop',
  'iloveyou',
  'admin123',
  'welcome1',
  'welcome123',
  'letmein1',
  'abc12345',
  'football',
  'baseball',
  'sunshine',
  'princess',
  'trustno1',
]);

export interface PasswordCheck {
  key: 'length' | 'numeric' | 'common';
  label: string;
  ok: boolean;
}

/** Live checklist mirroring the server validators (min length 8, not only numbers, not too common). */
export function passwordChecks(value: string): PasswordCheck[] {
  return [
    { key: 'length', label: 'At least 8 characters', ok: value.length >= 8 },
    { key: 'numeric', label: 'Not only numbers', ok: value.length > 0 && !/^\d+$/.test(value) },
    {
      key: 'common',
      label: 'Not a common password',
      ok: value.length >= 8 && !VERY_COMMON.has(value.toLowerCase()),
    },
  ];
}

/** Form-level validator: `confirm` must equal `password`. Sets `mismatch` on the group. */
export function matchValidator(password: string, confirm: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const a = group.get(password)?.value;
    const b = group.get(confirm)?.value;
    return a && b && a !== b ? { mismatch: true } : null;
  };
}

/** Control validator: all checklist items pass. */
export const strongPassword: ValidatorFn = (control) =>
  passwordChecks(control.value ?? '').every((c) => c.ok) ? null : { weak: true };
