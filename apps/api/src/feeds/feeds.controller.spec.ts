import type { AuthUser } from '../auth/auth.service';
import { FeedsController } from './feeds.controller';
import type { FeedsService } from './feeds.service';

describe('FeedsController', () => {
  const user: AuthUser = {
    id: 'user_1',
    email: 'person@example.com',
    emailConfirmedAt: new Date('2026-05-27T10:00:00.000Z'),
  };

  const list = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const remove = jest.fn();
  const enqueueManualPull = jest.fn();
  const feedsService = {
    list,
    create,
    update,
    remove,
    enqueueManualPull,
  } as unknown as FeedsService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists feeds for the authenticated user', () => {
    const controller = new FeedsController(feedsService);

    void controller.list(user);

    expect(list).toHaveBeenCalledWith('user_1');
  });

  it('creates feeds for the authenticated user', () => {
    const controller = new FeedsController(feedsService);

    void controller.create(user, { url: 'https://example.com/feed.xml' });

    expect(create).toHaveBeenCalledWith('user_1', {
      url: 'https://example.com/feed.xml',
    });
  });

  it('enqueues manual pulls for the authenticated user', () => {
    const controller = new FeedsController(feedsService);

    void controller.pull(user, 'feed_1');

    expect(enqueueManualPull).toHaveBeenCalledWith('user_1', 'feed_1');
  });
});
