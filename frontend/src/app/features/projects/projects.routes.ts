import { inject } from '@angular/core';
import { ResolveFn, Route, Routes } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { roleGuard } from '../../core/auth/role.guard';
import { findNavItem } from '../../core/config/route-helpers';
import { Role } from '../../core/models';
import { ProjectDetail, ProjectMode } from './data/project.models';
import { ProjectsApi } from './data/projects-api.service';

/** A PM only ever sees their own projects, so their running list is "My projects". */
const runningTitle: ResolveFn<string> = () => (inject(AuthService).role() === Role.ProjectManager ? 'My projects' : 'Running projects');
const completedTitle: ResolveFn<string> = () =>
  inject(AuthService).role() === Role.ProjectManager ? 'My completed projects' : 'Completed projects';

const projectResolver: ResolveFn<ProjectDetail | null> = (route) => inject(ProjectsApi).getShared(Number(route.paramMap.get('id')));

/** The top bar's h1 is the project's name. */
const projectTitle: ResolveFn<string> = (route) =>
  inject(ProjectsApi)
    .getShared(Number(route.paramMap.get('id')))
    .pipe(map((project) => project?.name ?? 'Project not found'));

function listRoute(path: string, mode: ProjectMode, title: ResolveFn<string>): Route {
  return {
    path,
    title,
    canActivate: [roleGuard],
    data: { roles: findNavItem(`/projects/${path}`)?.roles, mode },
    loadComponent: () => import('./pages/projects-list-page').then((m) => m.ProjectsListPage),
  };
}

// /projects redirects to the running list and keeps the query string (dashboard links such as
// /projects?over_budget=true land on the filtered list).
export const PROJECTS_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'running' },
  {
    path: 'convert',
    title: 'Convert a won lead',
    canActivate: [roleGuard],
    data: { roles: findNavItem('/projects/convert')?.roles },
    loadComponent: () => import('./pages/convert-page').then((m) => m.ConvertPage),
  },
  listRoute('running', 'running', runningTitle),
  listRoute('completed', 'completed', completedTitle),
  {
    path: ':id',
    title: projectTitle,
    canActivate: [roleGuard],
    resolve: { project: projectResolver },
    runGuardsAndResolvers: 'always',
    data: { roles: findNavItem('/projects')?.roles },
    loadComponent: () => import('./pages/project-detail-page').then((m) => m.ProjectDetailPage),
  },
];
