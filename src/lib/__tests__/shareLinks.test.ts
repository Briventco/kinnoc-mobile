import { Share } from 'react-native';

import {
  buildDeepLinkUrl,
  getCanonicalUrl,
  shareCommunity,
  shareEvent,
  shareInvite,
  sharePost,
  shareProfile,
} from '../shareLinks';

describe('shareLinks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
  });

  describe('buildDeepLinkUrl', () => {
    it('returns canonical URLs using getCanonicalUrl', () => {
      expect(getCanonicalUrl('/post/123')).toBe('https://web.kinnoc.app/post/123');
      expect(getCanonicalUrl('post/123')).toBe('https://web.kinnoc.app/post/123');
    });

    it('builds canonical URLs for all supported entities', () => {
      expect(buildDeepLinkUrl('community', 'caleb')).toBe('https://web.kinnoc.app/community/caleb');
      expect(buildDeepLinkUrl('post', 'post-123')).toBe('https://web.kinnoc.app/post/post-123');
      expect(buildDeepLinkUrl('profile', 'alice')).toBe('https://web.kinnoc.app/profile/alice');
      expect(buildDeepLinkUrl('event', 'tech-conf')).toBe('https://web.kinnoc.app/events/tech-conf');
      expect(buildDeepLinkUrl('invite', 'inv-99')).toBe('https://web.kinnoc.app/invite/inv-99');
    });

    it('correctly handles special characters', () => {
      expect(buildDeepLinkUrl('community', 'tech & design')).toBe('https://web.kinnoc.app/community/tech%20%26%20design');
    });
  });

  describe('share functions', () => {
    it('shares community links', async () => {
      await shareCommunity({ id: 'c1', name: 'Design Club', slug: 'design-club' });
      expect(Share.share).toHaveBeenCalledWith({
        title: 'Design Club',
        message: 'Join Design Club on Kinnoc: https://web.kinnoc.app/community/design-club',
        url: 'https://web.kinnoc.app/community/design-club',
      });
    });

    it('shares post links with snippet', async () => {
      await sharePost({
        id: 'p1',
        author: { displayName: 'John' },
        text: 'Excited to announce our new launch!',
      });
      expect(Share.share).toHaveBeenCalledWith({
        title: 'Post by John',
        message: 'John on Kinnoc: "Excited to announce our new launch!" — https://web.kinnoc.app/post/p1',
        url: 'https://web.kinnoc.app/post/p1',
      });
    });

    it('shares profile links', async () => {
      await shareProfile({ username: 'alice', displayName: 'Alice' });
      expect(Share.share).toHaveBeenCalledWith({
        title: 'Alice (@alice)',
        message: 'Alice (@alice) on Kinnoc: https://web.kinnoc.app/profile/alice',
        url: 'https://web.kinnoc.app/profile/alice',
      });
    });

    it('shares event links', async () => {
      await shareEvent({ id: 'e1', title: 'Tech Meetup', slug: 'tech-meetup' });
      expect(Share.share).toHaveBeenCalledWith({
        title: 'Tech Meetup',
        message: 'Tech Meetup on Kinnoc: https://web.kinnoc.app/events/tech-meetup',
        url: 'https://web.kinnoc.app/events/tech-meetup',
      });
    });

    it('shares invitation links', async () => {
      await shareInvite({ code: 'inv-456', communityName: 'Engineers' });
      expect(Share.share).toHaveBeenCalledWith({
        title: "Invitation to Engineers",
        message: "You're invited to join Engineers on Kinnoc: https://web.kinnoc.app/invite/inv-456",
        url: 'https://web.kinnoc.app/invite/inv-456',
      });
    });
  });
});
