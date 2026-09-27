import { Role } from '../models';
import { SIDEBAR_CONFIG, filterNavByRole } from './sidebar.config';

const labels = (role: Role) => filterNavByRole(SIDEBAR_CONFIG, role).map((i) => i.label);

describe('sidebar config', () => {
  it('shows the admin every top-level section', () => {
    expect(labels(Role.Admin)).toEqual([
      'Dashboard',
      'Leads',
      'Projects',
      'Accounts',
      'Expenses',
      'Reports',
      'Team',
      'Communication',
      'Settings',
    ]);
  });

  it('never shows Accounts, Reports or Team to a project manager (privacy shield)', () => {
    const visible = labels(Role.ProjectManager);
    expect(visible).toEqual(['Dashboard', 'Projects', 'Expenses', 'Communication', 'Settings']);
  });

  it('filters children by role', () => {
    const projects = filterNavByRole(SIDEBAR_CONFIG, Role.ProjectManager).find(
      (i) => i.label === 'Projects',
    );
    expect(projects?.children?.map((c) => c.label)).toEqual(['Running', 'Completed']);
  });

  it('returns nothing without a role', () => {
    expect(filterNavByRole(SIDEBAR_CONFIG, null)).toEqual([]);
  });

  it('lets every group cover the roles of all its children', () => {
    for (const group of SIDEBAR_CONFIG.filter((i) => i.children)) {
      for (const child of group.children ?? []) {
        for (const role of child.roles) {
          expect(group.roles, `${group.label} > ${child.label}`).toContain(role);
        }
      }
    }
  });

  it('uses unique routes', () => {
    const routes = SIDEBAR_CONFIG.flatMap((i) => [i.route, ...(i.children ?? []).map((c) => c.route)]);
    expect(new Set(routes).size).toBe(routes.length);
  });
});
