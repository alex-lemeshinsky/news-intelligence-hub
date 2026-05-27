import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Job, JobsOptions, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAMES, QueueName } from '@nih/shared';

type QueuePayload = object;

@Injectable()
export class QueuesService implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();
  private connection: Redis | null = null;

  getQueueNames(): QueueName[] {
    return Object.values(QUEUE_NAMES);
  }

  getQueue(queueName: string): Queue {
    if (!this.isKnownQueue(queueName)) {
      throw new Error(`Unknown queue: ${queueName}`);
    }

    const existingQueue = this.queues.get(queueName);
    if (existingQueue) {
      return existingQueue;
    }

    const queue = new Queue(queueName, {
      connection: this.getConnection(),
    });
    this.queues.set(queueName, queue);
    return queue;
  }

  async enqueue(
    queueName: QueueName,
    jobName: string,
    payload: QueuePayload,
    options: JobsOptions = {},
  ): Promise<Job> {
    return this.getQueue(queueName).add(jobName, payload, {
      removeOnComplete: 100,
      removeOnFail: 1000,
      ...options,
    });
  }

  getBullBoardAdapters(): BullMQAdapter[] {
    return this.getQueueNames().map(
      (queueName) => new BullMQAdapter(this.getQueue(queueName)),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.queues.clear();

    if (this.connection) {
      await this.connection.quit();
      this.connection = null;
    }
  }

  private getConnection(): Redis {
    this.connection ??= new Redis(
      process.env.REDIS_URL ?? 'redis://localhost:6379',
      {
        maxRetriesPerRequest: null,
      },
    );
    return this.connection;
  }

  private isKnownQueue(queueName: string): queueName is QueueName {
    return this.getQueueNames().includes(queueName as QueueName);
  }
}
