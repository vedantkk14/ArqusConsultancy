import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, tap, throwError } from 'rxjs';
import { ApiService } from '../api/api.service';
import { ROLE_HOME } from '../config/role-home';
import { ApiError, Role } from '../models';
import { AuthResponse, AuthUser, TokenPair } from './auth.models';
import { safeReturnUrl } from './safe-return-url';
import { TokenStorage } from './token-storage';

export const CHANGE_PASSWORD_URL = '/account/change-password';

/** Session state (signals) and every auth call. Knows storage only through `TokenStorage`. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly storage = inject(TokenStorage);
  private readonly router = inject(Router);

  private readonly currentUser = signal<AuthUser | null>(null);
  private refreshInFlight$: Observable<string> | null = null;
  /** True once the startup session check has finished (expired-session redirects wait for it). */
  private ready = false;

  readonly user = this.currentUser.asReadonly();
  readonly role = computed<Role | null>(() => this.currentUser()?.role ?? null);
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly mustChangePassword = computed(() => !!this.currentUser()?.must_change_password);

  constructor() {
    // Another tab signed out -> sign out here too. Another tab signed in with "Remember me" -> pick it up.
    this.storage.events$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((event) => {
      if (event === 'logout' && this.isAuthenticated()) {
        this.endSession();
        void this.router.navigate(['/login']);
      } else if (event === 'login' && !this.isAuthenticated()) {
        void this.loadSession().then(() => {
          if (this.isAuthenticated() && this.router.url.startsWith('/login')) {
            void this.router.navigateByUrl(this.afterLoginUrl());
          }
        });
      }
    });
  }

  /**
   * Startup (APP_INITIALIZER): if tokens exist, validate them with /me. A 401 has already been through
   * one refresh in the interceptor; if the session is still invalid it is cleared quietly.
   */
  async loadSession(): Promise<void> {
    try {
      if (!this.storage.access && !this.storage.refresh) {
        return;
      }
      this.currentUser.set(await firstValueFrom(this.api.get<AuthUser>('/me')));
    } catch (err) {
      const status = (err as ApiError)?.status;
      if (status === 401 || status === 403) {
        this.endSession();
      }
      // Network or server trouble: keep the tokens so the next attempt can still use them.
    } finally {
      this.ready = true;
    }
  }

  login(identifier: string, password: string, remember = false): Observable<AuthUser> {
    return this.api.post<AuthResponse>('/auth/login', { identifier, password }).pipe(
      tap((res) => {
        this.storage.set(res, remember);
        this.currentUser.set({ ...res.user, must_change_password: res.must_change_password });
        if (remember) {
          this.storage.broadcast('login');
        }
      }),
      map(() => this.currentUser() as AuthUser),
    );
  }

  /** Sign out: revoke the refresh token in the background, clear everything, go to /login. */
  logout(): void {
    const refresh = this.storage.refresh;
    this.endSession();
    this.storage.broadcast('logout');
    if (refresh) {
      this.api.post('/auth/logout', { refresh }).subscribe({ error: () => undefined });
    }
    void this.router.navigate(['/login']);
  }

  /** The session can't be renewed: clear it and ask the user to sign in, then come back here. */
  expireSession(): void {
    if (!this.currentUser() && !this.storage.refresh && !this.storage.access) {
      return;
    }
    const returnUrl = safeReturnUrl(this.router.url);
    this.endSession();
    if (this.ready) {
      void this.router.navigate(['/login'], {
        queryParams: { reason: 'expired', ...(returnUrl ? { returnUrl } : {}) },
      });
    }
  }

  /**
   * Single-flight refresh: concurrent callers share one request. If it fails but another tab has
   * rotated the token in the meantime, use that tab's new tokens instead of signing out.
   */
  refreshAccessToken(): Observable<string> {
    const refresh = this.storage.refresh;
    if (!refresh) {
      return throwError(() => new Error('No refresh token'));
    }
    this.refreshInFlight$ ??= this.api.post<TokenPair>('/auth/refresh', { refresh }).pipe(
      tap((res) => this.storage.set(res)),
      map((res) => res.access),
      catchError((err) => {
        const rotatedElsewhere = this.storage.refresh && this.storage.refresh !== refresh;
        return rotatedElsewhere && this.storage.access ? of(this.storage.access) : throwError(() => err);
      }),
      finalize(() => (this.refreshInFlight$ = null)),
      shareReplay(1),
    );
    return this.refreshInFlight$;
  }

  changePassword(oldPassword: string, newPassword: string): Observable<AuthUser> {
    return this.api
      .post<AuthResponse>('/auth/password/change', { old_password: oldPassword, new_password: newPassword })
      .pipe(
        tap((res) => {
          this.storage.set(res);
          this.currentUser.set({ ...res.user, must_change_password: false });
        }),
        map(() => this.currentUser() as AuthUser),
      );
  }

  /** Keep the signed-in user in step after they edit their own profile. */
  updateUser(patch: Partial<AuthUser>): void {
    this.currentUser.update((user) => (user ? { ...user, ...patch } : user));
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>('/auth/password/forgot', { email });
  }

  resetPassword(uid: string, token: string, newPassword: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>('/auth/password/reset', {
      uid,
      token,
      new_password: newPassword,
    });
  }

  /** Landing route for the current user's role. */
  homeRoute(): string {
    const role = this.role();
    return role ? ROLE_HOME[role] : '/login';
  }

  /** Where to go after signing in: forced password change, then a safe returnUrl, then home. */
  afterLoginUrl(returnUrl?: unknown): string {
    if (this.mustChangePassword()) {
      return `${CHANGE_PASSWORD_URL}?forced=true`;
    }
    return safeReturnUrl(returnUrl) ?? this.homeRoute();
  }

  private endSession(): void {
    this.storage.clear();
    this.currentUser.set(null);
    this.refreshInFlight$ = null;
  }
}
