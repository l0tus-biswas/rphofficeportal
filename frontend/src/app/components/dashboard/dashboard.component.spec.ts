import { of, throwError } from 'rxjs';
import { DashboardComponent } from './dashboard.component';

function makeComponent(broadcastService: any, router: any = { navigateByUrl: jasmine.createSpy('navigateByUrl') }) {
  // Only the broadcast service and router are used by the announcements logic
  return new DashboardComponent(
    {} as any, {} as any, {} as any, {} as any, {} as any,
    broadcastService, router, {} as any, {} as any
  );
}

describe('DashboardComponent announcements', () => {
  it('loads the latest 3 announcements from a flat or wrapped response', () => {
    const svc = { getBroadcasts: jasmine.createSpy().and.returnValue(of({ broadcasts: [{ _id: '1' }, { _id: '2' }] })) };
    const c = makeComponent(svc);
    c.loadAnnouncements();
    expect(svc.getBroadcasts).toHaveBeenCalledWith(1, 3);
    expect(c.announcements.length).toBe(2);

    svc.getBroadcasts.and.returnValue(of({ data: { broadcasts: [{ _id: '9' }] } }));
    c.loadAnnouncements();
    expect(c.announcements.length).toBe(1);
  });

  it('shows no announcements when the request fails', () => {
    const c = makeComponent({ getBroadcasts: () => throwError(() => new Error('x')) });
    c.announcements = [{ _id: '1' }];
    c.loadAnnouncements();
    expect(c.announcements).toEqual([]);
  });

  it('expands, marks unread as read once, and collapses again', () => {
    const svc = {
      getBroadcast: jasmine.createSpy().and.returnValue(of({})),
      refreshUnreadCount: jasmine.createSpy()
    };
    const c = makeComponent(svc);
    const a: any = { _id: 'a1', isRead: false };

    c.toggleAnnouncement(a);
    expect(c.expandedAnnouncementId).toBe('a1');
    expect(a.isRead).toBeTrue();
    expect(svc.getBroadcast).toHaveBeenCalledWith('a1');
    expect(svc.refreshUnreadCount).toHaveBeenCalled();

    c.toggleAnnouncement(a);
    expect(c.expandedAnnouncementId).toBeNull();
    expect(svc.getBroadcast).toHaveBeenCalledTimes(1);
  });

  it('opens external links in a new tab and internal links through the router', () => {
    const router = { navigateByUrl: jasmine.createSpy('navigateByUrl') };
    const c = makeComponent({}, router);
    const open = spyOn(window, 'open');
    c.openAnnouncementLink('https://example.com/x');
    expect(open).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener');
    c.openAnnouncementLink('/licensing');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/licensing');
  });
});
