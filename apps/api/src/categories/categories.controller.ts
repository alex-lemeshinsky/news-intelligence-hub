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
import { CategoriesService } from './categories.service';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from './categories.service';

@Controller('categories')
@UseGuards(CookieAuthGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.categoriesService.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateCategoryInput) {
    return this.categoriesService.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') categoryId: string,
    @Body() body: UpdateCategoryInput,
  ) {
    return this.categoriesService.update(user.id, categoryId, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') categoryId: string) {
    return this.categoriesService.remove(user.id, categoryId);
  }
}
