import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DigestStatus } from '@prisma/client';
import { JOB_NAMES, QUEUE_NAMES } from '@nih/shared';
import { DigestsService } from './digests.service';

describe('DigestsService', () => {
  const countCategories = jest.fn();
  const countEntities = jest.fn();
  const createDigest = jest.fn();
  const findDigest = jest.fn();
  const findDigests = jest.fn();
  const updateDigest = jest.fn();
  const enqueue = jest.fn();

  const database = {
    category: {
      count: countCategories,
    },
    digest: {
      create: createDigest,
      findFirst: findDigest,
      findMany: findDigests,
      update: updateDigest,
    },
    entity: {
      count: countEntities,
    },
  };
  const queues = {
    enqueue,
  };
  const now = new Date('2026-06-07T12:00:00.000Z');

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a week digest with normalized scope and enqueues the worker', async () => {
    countCategories.mockResolvedValue(1);
    countEntities.mockResolvedValue(1);
    createDigest.mockResolvedValue({
      completedAt: null,
      createdAt: now,
      error: null,
      id: 'digest_1',
      overview: null,
      periodEnd: now,
      periodStart: new Date('2026-05-31T12:00:00.000Z'),
      scopeJson: {
        categoryIds: ['category_1'],
        entityIds: ['entity_1'],
        period: 'week',
      },
      status: DigestStatus.PENDING,
      userId: 'user_1',
    });
    enqueue.mockResolvedValue({ id: 'job_1' });
    const service = new DigestsService(database as never, queues as never);

    const digest = await service.create('user_1', {
      categoryIds: ['category_1', 'category_1', ''],
      entityIds: ['entity_1', ' '],
      period: 'week',
    });

    expect(countCategories).toHaveBeenCalledWith({
      where: {
        id: { in: ['category_1'] },
        userId: 'user_1',
      },
    });
    expect(countEntities).toHaveBeenCalledWith({
      where: {
        id: { in: ['entity_1'] },
        userId: 'user_1',
      },
    });
    expect(createDigest).toHaveBeenCalledWith({
      data: {
        periodEnd: now,
        periodStart: new Date('2026-05-31T12:00:00.000Z'),
        scopeJson: {
          categoryIds: ['category_1'],
          entityIds: ['entity_1'],
          period: 'week',
        },
        userId: 'user_1',
      },
    });
    expect(enqueue).toHaveBeenCalledWith(
      QUEUE_NAMES.digest,
      JOB_NAMES.buildDigest,
      {
        digestId: 'digest_1',
        userId: 'user_1',
      },
    );
    expect(digest).toEqual({
      completedAt: null,
      createdAt: now.toISOString(),
      error: null,
      facts: null,
      id: 'digest_1',
      overview: null,
      period: 'week',
      periodEnd: now.toISOString(),
      periodStart: '2026-05-31T12:00:00.000Z',
      scope: {
        categoryIds: ['category_1'],
        entityIds: ['entity_1'],
      },
      status: 'PENDING',
    });
  });

  it('rejects category scope outside the current tenant', async () => {
    countCategories.mockResolvedValue(0);
    countEntities.mockResolvedValue(0);
    const service = new DigestsService(database as never, queues as never);

    await expect(
      service.create('user_1', {
        categoryIds: ['category_other'],
        entityIds: [],
        period: 'day',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(createDigest).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('lists only digests owned by the current user', async () => {
    findDigests.mockResolvedValue([
      {
        completedAt: new Date('2026-06-07T12:01:00.000Z'),
        createdAt: now,
        error: null,
        id: 'digest_1',
        overview: 'Digest overview.',
        periodEnd: now,
        periodStart: new Date('2026-06-06T12:00:00.000Z'),
        scopeJson: {
          categoryIds: [],
          entityIds: [],
          facts: {
            keyArticles: [],
            topCategories: [],
            topEntities: [],
          },
          period: 'day',
        },
        status: DigestStatus.COMPLETED,
        userId: 'user_1',
      },
    ]);
    const service = new DigestsService(database as never, queues as never);

    const digests = await service.list('user_1');

    expect(findDigests).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      where: { userId: 'user_1' },
    });
    expect(digests[0]?.facts).toEqual({
      keyArticles: [],
      topCategories: [],
      topEntities: [],
    });
  });

  it('reads one owned digest and rejects foreign ids', async () => {
    findDigest.mockResolvedValueOnce(null);
    const service = new DigestsService(database as never, queues as never);

    await expect(service.get('user_1', 'digest_other')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(findDigest).toHaveBeenCalledWith({
      where: {
        id: 'digest_other',
        userId: 'user_1',
      },
    });
  });
});
