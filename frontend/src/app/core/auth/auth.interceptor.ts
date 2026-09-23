import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { TokenStorage } from './token-storage';

const AUTH_ENDPOINT = /\/auth\/(login|refresh)$/;

const withToken = (req: HttpRequest<unknown>, token: string | null) =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

/** Adds the Bearer token; on a 401 refreshes once and retries, otherwise logs the user out. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }

  const auth = inject(AuthService);
  const storage = inject(TokenStorage);
  const isAuthCall = AUTH_ENDPOINT.test(req.url);

  return next(isAuthCall ? req : withToken(req, storage.access)).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || isAuthCall) {
        return throwError(() => err);
      }
      if (!storage.refresh) {
        auth.logout();
        return throwError(() => err);
      }
      return auth.refreshAccessToken().pipe(
        catchError((refreshErr: unknown) => {
          auth.logout();
          return throwError(() => refreshErr);
        }),
        switchMap((token) => next(withToken(req, token))),
      );
    }),
  );
};
