import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, firstValueFrom, map, shareReplay, tap, throwError } from 'rxjs';
import { ApiService } from '../api/api.service';
import { LoginResponse, ROLE_HOME, Role, User } from '../models';
import { TokenStorage } from './token-storage';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly storage = inject(TokenStorage);
  private readonly router = inject(Router);

  private readonly currentUser = signal<User | null>(null);
  private refreshInFlight$: Observable<string> | null = null;

  readonly user = this.currentUser.asReadonly();
  readonly role = computed<Role | null>(() => this.currentUser()?.role ?? null);
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  /** Runs once at startup: if tokens exist, load the user so guards see the right state. */
  async restoreSession(): Promise<void> {
    if (!this.storage.access && !this.storage.refresh) {
      return;
    }
    try {
      this.currentUser.set(await firstValueFrom(this.api.get<User>('/me')));
    } catch {
      this.storage.clear();
    }
  }

  login(username: string, password: string): Observable<User> {
    return this.api.post<LoginResponse>('/auth/login', { username, password }).pipe(
      tap((res) => {
        this.storage.set(res.access, res.refresh);
        this.currentUser.set(res.user);
      }),
      map((res) => res.user),
    );
  }

  /** One refresh at a time: concurrent 401s share the same request. */
  refreshAccessToken(): Observable<string> {
    const refresh = this.storage.refresh;
    if (!refresh) {
      return throwError(() => new Error('No refresh token'));
    }
    this.refreshInFlight$ ??= this.api
      .post<{ access: string; refresh?: string }>('/auth/refresh', { refresh })
      .pipe(
        tap((res) => this.storage.set(res.access, res.refresh)),
        map((res) => res.access),
        finalize(() => (this.refreshInFlight$ = null)),
        shareReplay(1),
      );
    return this.refreshInFlight$;
  }

  logout(): void {
    this.storage.clear();
    this.currentUser.set(null);
    void this.router.navigate(['/login']);
  }

  /** Landing route for the current user's role. */
  homeRoute(): string {
    const role = this.role();
    return role ? ROLE_HOME[role] : '/login';
  }
}
