import { QUEUE_NAMES } from '@nih/shared';
import { QueuesService } from './queues.service';

describe('QueuesService', () => {
  it('enqueues jobs with safe retention defaults', async () => {
    const service = new QueuesService();
    const add = jest.fn().mockResolvedValue({ id: 'job_1' });
    jest.spyOn(service, 'getQueue').mockReturnValue({ add } as never);

    const job = await service.enqueue(QUEUE_NAMES.feedPull, 'pull-feed', {
      feedId: 'feed_1',
    });

    expect(add).toHaveBeenCalledWith(
      'pull-feed',
      { feedId: 'feed_1' },
      {
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    );
    expect(job).toEqual({ id: 'job_1' });
  });

  it('rejects unknown queue names', () => {
    const service = new QueuesService();

    expect(() => service.getQueue('unknown')).toThrow('Unknown queue');
  });
});
