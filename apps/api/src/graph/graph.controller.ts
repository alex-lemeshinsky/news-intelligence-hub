import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.service';
import { CookieAuthGuard } from '../auth/cookie-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { GraphFilters, GraphService } from './graph.service';

interface GraphQuery {
  categoryId?: string;
  nodeKind?: string;
  search?: string;
  timeWindow?: string;
}

@Controller('graph')
@UseGuards(CookieAuthGuard)
export class GraphController {
  constructor(private readonly graphService: GraphService) {}

  @Get()
  getGraph(@CurrentUser() user: AuthUser, @Query() query: GraphQuery) {
    return this.graphService.getGraph(user.id, normalizeQuery(query));
  }

  @Get('entities/:entityId')
  getEntityDetail(
    @CurrentUser() user: AuthUser,
    @Param('entityId') entityId: string,
  ) {
    return this.graphService.getEntityDetail(user.id, entityId);
  }
}

function normalizeQuery(query: GraphQuery): GraphFilters {
  return {
    categoryId: emptyToUndefined(query.categoryId),
    nodeKind: enumValue(
      {
        article: 'article',
        entity: 'entity',
      } as const,
      query.nodeKind,
    ),
    search: emptyToUndefined(query.search),
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
