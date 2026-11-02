import { of } from 'rxjs';
import { NotificationsComponent } from './notifications.component';

describe('NotificationsComponent broadcast composer', () => {
  let svc: jasmine.SpyObj<any>;
  let cmp: NotificationsComponent;

  beforeEach(() => {
    svc = jasmine.createSpyObj('NotificationService', ['broadcast']);
    cmp = new NotificationsComponent(svc, {} as any, {} as any);
  });

  it('disables send when the editor is empty (Quill empty markup or whitespace)', () => {
    cmp.broadcastTitle = 'Title';
    for (const empty of ['', '   ', '<p><br></p>', '<p> </p>']) {
      cmp.broadcastMessage = empty;
      expect(cmp.isBroadcastMessageEmpty).withContext(empty).toBeTrue();
      expect(cmp.canSendBroadcast).withContext(empty).toBeFalse();
    }
  });

  it('disables send without a title and enables with title + content', () => {
    cmp.broadcastMessage = '<p>Hello</p>';
    cmp.broadcastTitle = '  ';
    expect(cmp.canSendBroadcast).toBeFalse();
    cmp.broadcastTitle = 'T';
    expect(cmp.canSendBroadcast).toBeTrue();
  });

  it('does not call the API when empty', () => {
    cmp.broadcastTitle = 'T';
    cmp.broadcastMessage = '<p><br></p>';
    cmp.sendBroadcast();
    expect(svc.broadcast).not.toHaveBeenCalled();
  });

  it('sends title, html message and attached image', () => {
    svc.broadcast.and.returnValue(of({ sentCount: 2 }));
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    cmp.broadcastTitle = 'T';
    cmp.broadcastMessage = '<p><strong>Hi</strong></p>';
    cmp.broadcastImageFile = file;
    cmp.sendBroadcast();
    expect(svc.broadcast).toHaveBeenCalledWith('T', '<p><strong>Hi</strong></p>', undefined, undefined, file);
    expect(cmp.broadcastImageFile).toBeNull();
    expect(cmp.broadcastMessage).toBe('');
  });

  it('rejects non-image and oversized files', () => {
    const big = new File([new ArrayBuffer(5 * 1024 * 1024 + 1)], 'b.png', { type: 'image/png' });
    cmp.onBroadcastImageSelected({ target: { files: [big], value: '' } } as any);
    expect(cmp.broadcastImageFile).toBeNull();
    expect(cmp.broadcastImageError).toContain('5MB');
    const txt = new File(['x'], 'a.txt', { type: 'text/plain' });
    cmp.onBroadcastImageSelected({ target: { files: [txt], value: '' } } as any);
    expect(cmp.broadcastImageFile).toBeNull();
    expect(cmp.broadcastImageError).toContain('image');
  });
});
