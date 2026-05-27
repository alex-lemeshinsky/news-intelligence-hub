import { Injectable, NotFoundException } from '@nestjs/common';
import { FeedStatus } from '@prisma/client';
import { FeedPullJobData, JOB_NAMES, QUEUE_NAMES } from '@nih/shared';
import { DatabaseService } from '../database/database.service';
import { QueuesService } from '../queues/queues.service';
import { FeedValidationService } from './feed-validation.service';

export interface CreateFeedInput {
  url: string;
}

export interface UpdateFeedInput {
  url?: string;
  title?: string | null;
  status?: FeedStatus;
}

@Injectable()
export class FeedsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly queues: QueuesService,
    private readonly feedValidation: FeedValidationService,
  ) {}

  list(userId: string) {
    return this.database.feed.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, input: CreateFeedInput) {
    const validation = await this.feedValidation.validateFeedUrl(input.url);

    return this.database.feed.create({
      data: {
        userId,
        url: input.url,
        title: validation.title,
        status: FeedStatus.ACTIVE,
      },
    });
  }

  async update(userId: string, feedId: string, input: UpdateFeedInput) {
    const feed = await this.findOwnedFeed(userId, feedId);
    const validation = input.url
      ? await this.feedValidation.validateFeedUrl(input.url)
      : undefined;

    return this.database.feed.update({
      where: { id: feed.id },
      data: {
        url: input.url,
        title: input.title ?? validation?.title,
        status: input.status,
      },
    });
  }

  async remove(userId: string, feedId: string) {
    const feed = await this.findOwnedFeed(userId, feedId);
    return this.database.feed.delete({
      where: { id: feed.id },
    });
  }

  async enqueueManualPull(userId: string, feedId: string) {
    const feed = await this.findOwnedFeed(userId, feedId);
    const payload: FeedPullJobData = {
      feedId: feed.id,
      userId,
    };

    return this.queues.enqueue(
      QUEUE_NAMES.feedPull,
      JOB_NAMES.pullFeed,
      payload,
    );
  }

  private async findOwnedFeed(userId: string, feedId: string) {
    const feed = await this.database.feed.findFirst({
      where: {
        id: feedId,
        userId,
      },
    });

    if (!feed) {
      throw new NotFoundException('Feed was not found.');
    }

    return feed;
  }
}
