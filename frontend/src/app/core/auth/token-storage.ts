import { Injectable } from '@angular/core';

const ACCESS_KEY = 'crm.access';
const REFRESH_KEY = 'crm.refresh';

/** Persists JWTs in localStorage (guarded: storage can be blocked or unavailable). */
@Injectable({ providedIn: 'root' })
export class TokenStorage {
  get access(): string | null {
    return this.read(ACCESS_KEY);
  }

  get refresh(): string | null {
    return this.read(REFRESH_KEY);
  }

  set(access: string, refresh?: string): void {
    this.write(ACCESS_KEY, access);
    if (refresh) {
      this.write(REFRESH_KEY, refresh);
    }
  }

  clear(): void {
    for (const key of [ACCESS_KEY, REFRESH_KEY]) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* storage unavailable */
      }
    }
  }

  private read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  }
}
