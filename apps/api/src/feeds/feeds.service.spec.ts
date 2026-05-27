import { NotFoundException } from '@nestjs/common';
import { FeedStatus } from '@prisma/client';
import { JOB_NAMES, QUEUE_NAMES } from '@nih/shared';
import { FeedsService } from './feeds.service';

describe('FeedsService', () => {
  const createFeed = jest.fn();
  const findFeeds = jest.fn();
  const findFeed = jest.fn();
  const updateFeed = jest.fn();
  const deleteFeed = jest.fn();
  const enqueue = jest.fn();
  const validateFeedUrl = jest.fn();

  const database = {
    feed: {
      create: createFeed,
      findMany: findFeeds,
      findFirst: findFeed,
      update: updateFeed,
      delete: deleteFeed,
    },
  };

  const queues = {
    enqueue,
  };

  const validator = {
    validateFeedUrl,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates and creates a feed for the current user', async () => {
    validateFeedUrl.mockResolvedValue({ title: 'Tech Feed' });
    createFeed.mockResolvedValue({
      id: 'feed_1',
      userId: 'user_1',
      url: 'https://example.com/rss.xml',
      title: 'Tech Feed',
      status: FeedStatus.ACTIVE,
    });

    const service = new FeedsService(
      database as never,
      queues as never,
      validator as never,
    );

    const feed = await service.create('user_1', {
      url: 'https://example.com/rss.xml',
    });

    expect(validateFeedUrl).toHaveBeenCalledWith('https://example.com/rss.xml');
    expect(createFeed).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        url: 'https://example.com/rss.xml',
        title: 'Tech Feed',
        status: FeedStatus.ACTIVE,
      },
    });
    expect(feed.id).toBe('feed_1');
  });

  it('enqueues a manual feed pull only for an owned feed', async () => {
    findFeed.mockResolvedValue({
      id: 'feed_1',
      userId: 'user_1',
      status: FeedStatus.ACTIVE,
    });
    enqueue.mockResolvedValue({ id: 'job_1' });

    const service = new FeedsService(
      database as never,
      queues as never,
      validator as never,
    );

    await service.enqueueManualPull('user_1', 'feed_1');

    expect(enqueue).toHaveBeenCalledWith(
      QUEUE_NAMES.feedPull,
      JOB_NAMES.pullFeed,
      {
        feedId: 'feed_1',
        userId: 'user_1',
      },
    );
  });

  it('rejects manual pulls for feeds outside the current tenant', async () => {
    findFeed.mockResolvedValue(null);

    const service = new FeedsService(
      database as never,
      queues as never,
      validator as never,
    );

    await expect(service.enqueueManualPull('user_2', 'feed_1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
