import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.service';
import { CookieAuthGuard } from '../auth/cookie-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { FeedsService } from './feeds.service';
import type { CreateFeedInput, UpdateFeedInput } from './feeds.service';

@Controller('feeds')
@UseGuards(CookieAuthGuard)
export class FeedsController {
  constructor(private readonly feedsService: FeedsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.feedsService.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateFeedInput) {
    return this.feedsService.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') feedId: string,
    @Body() body: UpdateFeedInput,
  ) {
    return this.feedsService.update(user.id, feedId, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') feedId: string) {
    return this.feedsService.remove(user.id, feedId);
  }

  @Post(':id/pull')
  pull(@CurrentUser() user: AuthUser, @Param('id') feedId: string) {
    return this.feedsService.enqueueManualPull(user.id, feedId);
  }
}
