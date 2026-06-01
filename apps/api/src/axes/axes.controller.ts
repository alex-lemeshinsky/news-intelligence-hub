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
import { AxesService } from './axes.service';
import type { CreateAxisInput, UpdateAxisInput } from './axes.service';

@Controller('axes')
@UseGuards(CookieAuthGuard)
export class AxesController {
  constructor(private readonly axesService: AxesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.axesService.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateAxisInput) {
    return this.axesService.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') axisId: string,
    @Body() body: UpdateAxisInput,
  ) {
    return this.axesService.update(user.id, axisId, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') axisId: string) {
    return this.axesService.remove(user.id, axisId);
  }
}
