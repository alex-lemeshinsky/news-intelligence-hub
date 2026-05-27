import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { FeedsService } from './feeds.service';
import type { CreateFeedInput, UpdateFeedInput } from './feeds.service';

@Controller('feeds')
export class FeedsController {
  constructor(private readonly feedsService: FeedsService) {}

  @Get()
  list(@Headers('x-user-id') userId: string | undefined) {
    return this.feedsService.list(this.requireUserId(userId));
  }

  @Post()
  create(
    @Headers('x-user-id') userId: string | undefined,
    @Body() body: CreateFeedInput,
  ) {
    return this.feedsService.create(this.requireUserId(userId), body);
  }

  @Patch(':id')
  update(
    @Headers('x-user-id') userId: string | undefined,
    @Param('id') feedId: string,
    @Body() body: UpdateFeedInput,
  ) {
    return this.feedsService.update(this.requireUserId(userId), feedId, body);
  }

  @Delete(':id')
  remove(
    @Headers('x-user-id') userId: string | undefined,
    @Param('id') feedId: string,
  ) {
    return this.feedsService.remove(this.requireUserId(userId), feedId);
  }

  @Post(':id/pull')
  pull(
    @Headers('x-user-id') userId: string | undefined,
    @Param('id') feedId: string,
  ) {
    return this.feedsService.enqueueManualPull(
      this.requireUserId(userId),
      feedId,
    );
  }

  private requireUserId(userId: string | undefined): string {
    if (!userId) {
      throw new UnauthorizedException('Missing x-user-id header.');
    }

    return userId;
  }
}
