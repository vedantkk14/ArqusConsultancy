import { Injectable, NgZone, OnDestroy, forwardRef, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/** Cross-tab session events (another tab signed in with "Remember me", or signed out). */
export type SessionEvent = 'login' | 'logout';

/**
 * Where the JWTs live. AuthService depends only on this interface.
 *
 * - Web: `WebTokenStorage` below (localStorage / sessionStorage / memory).
 * - Mobile (future Capacitor wrapper): provide a secure-storage implementation (Keychain / Keystore)
 *   with `{ provide: TokenStorage, useClass: SecureTokenStorage }`; nothing else needs to change.
 */
@Injectable({ providedIn: 'root', useExisting: forwardRef(() => WebTokenStorage) })
export abstract class TokenStorage {
  abstract readonly access: string | null;
  abstract readonly refresh: string | null;
  /** Whether the current session was stored with "Remember me". */
  abstract readonly remembered: boolean;
  /** Emits when ANOTHER tab signs in or out. */
  abstract readonly events$: Observable<SessionEvent>;

  /** Store tokens. `remember` undefined keeps the current mode (used by refresh rotation). */
  abstract set(tokens: { access: string; refresh?: string }, remember?: boolean): void;
  abstract clear(): void;
  /** Tell other tabs about a sign-in or sign-out. */
  abstract broadcast(event: SessionEvent): void;
}

const ACCESS_KEY = 'crm.access';
const REFRESH_KEY = 'crm.refresh';
const EVENT_KEY = 'crm.session-event';

type Area = 'local' | 'session';

/**
 * Browser storage:
 * - "Remember me" on  -> localStorage (survives closing the browser, shared by all tabs).
 * - "Remember me" off -> sessionStorage (this tab only; gone when the tab closes).
 * - Storage blocked (private mode, policies) -> memory (gone on reload).
 * Every access is wrapped in try/catch.
 */
@Injectable({ providedIn: 'root' })
export class WebTokenStorage extends TokenStorage implements OnDestroy {
  private readonly memory = new Map<string, string>();
  private readonly eventsSubject = new Subject<SessionEvent>();
  readonly events$ = this.eventsSubject.asObservable();
  private readonly zone = inject(NgZone);
  private readonly onStorage = (e: StorageEvent) => this.zone.run(() => this.handleStorageEvent(e));

  constructor() {
    super();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.onStorage);
    }
  }

  get access(): string | null {
    return this.read(ACCESS_KEY);
  }

  get refresh(): string | null {
    return this.read(REFRESH_KEY);
  }

  get remembered(): boolean {
    return this.get('local', REFRESH_KEY) !== null;
  }

  set(tokens: { access: string; refresh?: string }, remember?: boolean): void {
    const area: Area = (remember ?? this.remembered) ? 'local' : 'session';
    const other: Area = area === 'local' ? 'session' : 'local';
    const refresh = tokens.refresh ?? this.refresh;
    for (const [key, value] of [
      [ACCESS_KEY, tokens.access],
      [REFRESH_KEY, refresh],
    ] as const) {
      this.remove(other, key);
      if (value && !this.put(area, key, value)) {
        this.memory.set(key, value);
      }
    }
  }

  clear(): void {
    for (const key of [ACCESS_KEY, REFRESH_KEY]) {
      this.remove('local', key);
      this.remove('session', key);
      this.memory.delete(key);
    }
  }

  broadcast(event: SessionEvent): void {
    // A unique value each time so repeated events still fire `storage` in other tabs.
    this.put('local', EVENT_KEY, `${event}:${Date.now()}:${Math.random()}`);
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.onStorage);
    }
    this.eventsSubject.complete();
  }

  private handleStorageEvent(e: StorageEvent): void {
    if (e.storageArea !== this.area('local')) {
      return;
    }
    if (e.key === EVENT_KEY && e.newValue) {
      const event = e.newValue.split(':')[0];
      if (event === 'login' || event === 'logout') {
        this.eventsSubject.next(event);
      }
    } else if (e.key === null) {
      this.eventsSubject.next('logout'); // localStorage.clear() in another tab
    }
  }

  private read(key: string): string | null {
    return this.get('session', key) ?? this.get('local', key) ?? this.memory.get(key) ?? null;
  }

  private area(area: Area): Storage | null {
    try {
      return area === 'local' ? window.localStorage : window.sessionStorage;
    } catch {
      return null;
    }
  }

  private get(area: Area, key: string): string | null {
    try {
      return this.area(area)?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private put(area: Area, key: string, value: string): boolean {
    try {
      const storage = this.area(area);
      if (!storage) {
        return false;
      }
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  private remove(area: Area, key: string): void {
    try {
      this.area(area)?.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  }
}
