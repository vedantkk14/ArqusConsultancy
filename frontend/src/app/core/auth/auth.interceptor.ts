import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { TokenStorage } from './token-storage';

/** Endpoints that must never carry the access token or trigger a refresh. */
const PUBLIC_AUTH_ENDPOINT = /\/auth\/(login|refresh|logout|password\/forgot|password\/reset)$/;

/** Marks a request that has already been retried after a refresh, so a second 401 never loops. */
const RETRIED = new HttpContextToken<boolean>(() => false);

const isApiRequest = (url: string) =>
  url === environment.apiBaseUrl || url.startsWith(environment.apiBaseUrl + '/');

const withToken = (req: HttpRequest<unknown>, token: string | null) =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

/**
 * - Adds `Authorization: Bearer <access>` to our API only (never to other hosts, never to the public
 *   auth endpoints).
 * - On a 401: one shared refresh (parallel requests wait for it), then each request retries ONCE.
 * - If the refresh fails: the session is cleared and the user goes to /login?reason=expired.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req.url) || PUBLIC_AUTH_ENDPOINT.test(req.url)) {
    return next(req);
  }
  const auth = inject(AuthService);
  const storage = inject(TokenStorage);

  return next(withToken(req, storage.access)).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || req.context.get(RETRIED)) {
        return throwError(() => err);
      }
      if (!storage.refresh) {
        auth.expireSession();
        return throwError(() => err);
      }
      return auth.refreshAccessToken().pipe(
        catchError((refreshErr: unknown) => {
          auth.expireSession();
          return throwError(() => refreshErr);
        }),
        switchMap((token) => next(withToken(req.clone({ context: req.context.set(RETRIED, true) }), token))),
      );
    }),
  );
};
