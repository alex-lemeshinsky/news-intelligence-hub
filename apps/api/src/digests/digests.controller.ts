import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.service';
import { CookieAuthGuard } from '../auth/cookie-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DigestsService } from './digests.service';
import type { CreateDigestInput } from './digests.service';

@Controller('digests')
@UseGuards(CookieAuthGuard)
export class DigestsController {
  constructor(private readonly digestsService: DigestsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.digestsService.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateDigestInput) {
    return this.digestsService.create(user.id, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') digestId: string) {
    return this.digestsService.get(user.id, digestId);
  }
}
