import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ArticleImportance, ArticleProcessingStatus } from '@prisma/client';
import type { AuthUser } from '../auth/auth.service';
import { CookieAuthGuard } from '../auth/cookie-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ArticleListFilters, ArticlesService } from './articles.service';

interface ArticleListQuery {
  categoryId?: string;
  feedId?: string;
  importance?: string;
  status?: string;
  timeWindow?: string;
}

@Controller('articles')
@UseGuards(CookieAuthGuard)
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ArticleListQuery) {
    return this.articlesService.list(user.id, normalizeQuery(query));
  }
}

function normalizeQuery(query: ArticleListQuery): ArticleListFilters {
  return {
    categoryId: emptyToUndefined(query.categoryId),
    feedId: emptyToUndefined(query.feedId),
    importance: enumValue(ArticleImportance, query.importance),
    status: enumValue(ArticleProcessingStatus, query.status),
    timeWindow: enumValue(
      {
        '24h': '24h',
        '7d': '7d',
        '30d': '30d',
      } as const,
      query.timeWindow,
    ),
  };
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function enumValue<T extends Record<string, string>>(
  values: T,
  value: string | undefined,
): T[keyof T] | undefined {
  if (!value) {
    return undefined;
  }

  return Object.values(values).includes(value)
    ? (value as T[keyof T])
    : undefined;
}
