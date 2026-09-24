import { TestBed } from '@angular/core/testing';
import { LayoutService, SIDEBAR_STORAGE_KEY } from './layout.service';
import { fakeBreakpoints } from './testing/fake-breakpoints';

function create(width: number): LayoutService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [fakeBreakpoints(width)] });
  return TestBed.inject(LayoutService);
}

describe('LayoutService', () => {
  beforeEach(() => localStorage.clear());

  it('first visit: expanded at >= 1280px, collapsed at 1024-1279px', () => {
    expect(create(1440).collapsed()).toBe(false);
    expect(create(1100).collapsed()).toBe(true);
  });

  it('uses 256px expanded, 72px as a rail and 0 on mobile', () => {
    const layout = create(1440);
    expect(layout.sidebarWidth()).toBe(256);
    layout.toggleSidebar();
    expect(layout.sidebarWidth()).toBe(72);
    expect(create(800).sidebarWidth()).toBe(0);
  });

  it('persists the choice and restores it on the next load', () => {
    create(1440).toggleSidebar();
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('1');
    expect(create(1440).collapsed()).toBe(true); // "reload"

    create(1100).setCollapsed(false);
    expect(create(1100).collapsed()).toBe(false);
  });

  it('still works when storage throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const layout = create(1440);
    expect(() => layout.toggleSidebar()).not.toThrow();
    expect(layout.collapsed()).toBe(true);
    get.mockRestore();
    set.mockRestore();
  });
});
