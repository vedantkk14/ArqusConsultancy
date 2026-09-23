import { Routes } from '@angular/router';
import { placeholderRoutes } from '../../core/config/route-helpers';

// Replace a placeholder by adding a real route with the same `path` BEFORE it.
export const SETTINGS_ROUTES: Routes = placeholderRoutes('/settings');
