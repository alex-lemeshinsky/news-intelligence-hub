import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ArticleProcessingStatus } from '@prisma/client';
import { JOB_NAMES, QUEUE_NAMES } from '@nih/shared';
import { AxesService } from './axes.service';

describe('AxesService', () => {
  const countLabels = jest.fn();
  const createAxis = jest.fn();
  const createRun = jest.fn();
  const deleteAxis = jest.fn();
  const findAxes = jest.fn();
  const findAxis = jest.fn();
  const findLatestRun = jest.fn();
  const updateAxis = jest.fn();
  const updateRun = jest.fn();
  const enqueue = jest.fn();

  const database = {
    articleLabel: {
      count: countLabels,
    },
    classificationAxis: {
      create: createAxis,
      delete: deleteAxis,
      findFirst: findAxis,
      findMany: findAxes,
      update: updateAxis,
    },
    regenerationRun: {
      create: createRun,
      findFirst: findLatestRun,
      update: updateRun,
    },
  };
  const queues = {
    enqueue,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists only axes owned by the current user', async () => {
    findAxes.mockResolvedValue([
      {
        id: 'axis_1',
        name: 'Tone',
        values: ['Positive', 'Neutral'],
      },
    ]);
    const service = new AxesService(database as never, queues as never);

    const axes = await service.list('user_1');

    expect(findAxes).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      where: { userId: 'user_1' },
    });
    expect(axes).toEqual([
      {
        id: 'axis_1',
        name: 'Tone',
        values: ['Positive', 'Neutral'],
      },
    ]);
  });

  it('creates an axis with trimmed unique values', async () => {
    createAxis.mockResolvedValue({
      id: 'axis_1',
      name: 'Market impact',
      values: ['High', 'Low'],
    });
    const service = new AxesService(database as never, queues as never);

    await service.create('user_1', {
      name: ' Market impact ',
      values: [' High ', 'Low', 'high', ''],
    });

    expect(createAxis).toHaveBeenCalledWith({
      data: {
        name: 'Market impact',
        userId: 'user_1',
        values: ['High', 'Low'],
      },
    });
  });

  it('rejects axes without at least one value', async () => {
    const service = new AxesService(database as never, queues as never);

    await expect(
      service.create('user_1', {
        name: 'Tone',
        values: ['  ', ''],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates an owned axis by user scope', async () => {
    findAxis.mockResolvedValue({ id: 'axis_1', userId: 'user_1' });
    updateAxis.mockResolvedValue({
      id: 'axis_1',
      name: 'Reader level',
      values: ['Technical'],
    });
    const service = new AxesService(database as never, queues as never);

    await service.update('user_1', 'axis_1', {
      name: ' Reader level ',
      values: ['Technical', 'technical'],
    });

    expect(updateAxis).toHaveBeenCalledWith({
      data: {
        name: 'Reader level',
        values: ['Technical'],
      },
      where: { id: 'axis_1' },
    });
  });

  it('rejects updates outside the current tenant', async () => {
    findAxis.mockResolvedValue(null);
    const service = new AxesService(database as never, queues as never);

    await expect(
      service.update('user_2', 'axis_1', { name: 'Tone' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes only an owned axis', async () => {
    findAxis.mockResolvedValue({ id: 'axis_1', userId: 'user_1' });
    deleteAxis.mockResolvedValue({ id: 'axis_1' });
    const service = new AxesService(database as never, queues as never);

    await service.remove('user_1', 'axis_1');

    expect(deleteAxis).toHaveBeenCalledWith({
      where: { id: 'axis_1' },
    });
  });

  it('starts a regeneration run for processable labels and enqueues the worker', async () => {
    countLabels.mockResolvedValue(3);
    createRun.mockResolvedValue({
      id: 'run_1',
      userId: 'user_1',
      total: 3,
      processed: 0,
      failed: 0,
      status: 'PENDING',
    });
    enqueue.mockResolvedValue({ id: 'job_1' });
    const service = new AxesService(database as never, queues as never);

    const result = await service.startRegeneration('user_1');

    expect(countLabels).toHaveBeenCalledWith({
      where: {
        status: {
          in: [
            ArticleProcessingStatus.PROCESSED,
            ArticleProcessingStatus.FAILED,
          ],
        },
        userId: 'user_1',
      },
    });
    expect(createRun).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        total: 3,
      },
    });
    expect(enqueue).toHaveBeenCalledWith(
      QUEUE_NAMES.regeneration,
      JOB_NAMES.regenerateArticles,
      {
        runId: 'run_1',
        userId: 'user_1',
      },
    );
    expect(result).toEqual({
      id: 'run_1',
      userId: 'user_1',
      total: 3,
      processed: 0,
      failed: 0,
      status: 'PENDING',
    });
  });

  it('completes an empty regeneration run without queueing work', async () => {
    countLabels.mockResolvedValue(0);
    createRun.mockResolvedValue({
      id: 'run_empty',
      total: 0,
      userId: 'user_1',
    });
    updateRun.mockResolvedValue({
      id: 'run_empty',
      status: 'COMPLETED',
      total: 0,
      userId: 'user_1',
    });
    const service = new AxesService(database as never, queues as never);

    await service.startRegeneration('user_1');

    expect(enqueue).not.toHaveBeenCalled();
    expect(updateRun).toHaveBeenCalledWith({
      data: { status: 'COMPLETED' },
      where: { id: 'run_empty' },
    });
  });

  it('marks a regeneration run failed when enqueueing work fails', async () => {
    const queueError = new Error('Redis connection lost');
    countLabels.mockResolvedValue(2);
    createRun.mockResolvedValue({
      id: 'run_1',
      userId: 'user_1',
      total: 2,
      processed: 0,
      failed: 0,
      status: 'PENDING',
    });
    enqueue.mockRejectedValue(queueError);
    updateRun.mockResolvedValue({
      id: 'run_1',
      status: 'FAILED',
      total: 2,
      userId: 'user_1',
    });
    const service = new AxesService(database as never, queues as never);

    await expect(service.startRegeneration('user_1')).rejects.toThrow(
      queueError,
    );

    expect(updateRun).toHaveBeenCalledWith({
      data: {
        error: 'Redis connection lost',
        status: 'FAILED',
      },
      where: { id: 'run_1' },
    });
  });

  it('reads the latest regeneration run for the current user', async () => {
    findLatestRun.mockResolvedValue({ id: 'run_1', userId: 'user_1' });
    const service = new AxesService(database as never, queues as never);

    const run = await service.getLatestRegenerationRun('user_1');

    expect(findLatestRun).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      where: { userId: 'user_1' },
    });
    expect(run).toEqual({ id: 'run_1', userId: 'user_1' });
  });
});
