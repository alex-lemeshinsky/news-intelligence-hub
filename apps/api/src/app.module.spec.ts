import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { ArticlesModule } from './articles/articles.module';
import { ArticlesService } from './articles/articles.service';
import { AuthModule } from './auth/auth.module';
import { AuthService } from './auth/auth.service';
import { AxesModule } from './axes/axes.module';
import { AxesService } from './axes/axes.service';
import { CategoriesModule } from './categories/categories.module';
import { CategoriesService } from './categories/categories.service';
import { DatabaseModule } from './database/database.module';
import { DatabaseService } from './database/database.service';
import { DigestsModule } from './digests/digests.module';
import { DigestsService } from './digests/digests.service';
import { FeedsModule } from './feeds/feeds.module';
import { FeedsService } from './feeds/feeds.service';
import { GraphModule } from './graph/graph.module';
import { GraphService } from './graph/graph.service';
import { QueuesModule } from './queues/queues.module';
import { QueuesService } from './queues/queues.service';
import { TelemetryModule } from './telemetry/telemetry.module';
import { TelemetryService } from './telemetry/telemetry.service';
import { UsersModule } from './users/users.module';
import { UsersService } from './users/users.service';

describe('AppModule', () => {
  it('wires the core feature modules for the hackathon MVP', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.select(ArticlesModule).get(ArticlesService)).toBeDefined();
    expect(moduleRef.select(AuthModule).get(AuthService)).toBeDefined();
    expect(moduleRef.select(AxesModule).get(AxesService)).toBeDefined();
    expect(
      moduleRef.select(CategoriesModule).get(CategoriesService),
    ).toBeDefined();
    expect(moduleRef.select(DatabaseModule).get(DatabaseService)).toBeDefined();
    expect(moduleRef.select(DigestsModule).get(DigestsService)).toBeDefined();
    expect(moduleRef.select(FeedsModule).get(FeedsService)).toBeDefined();
    expect(moduleRef.select(GraphModule).get(GraphService)).toBeDefined();
    expect(moduleRef.select(QueuesModule).get(QueuesService)).toBeDefined();
    expect(
      moduleRef.select(TelemetryModule).get(TelemetryService),
    ).toBeDefined();
    expect(moduleRef.select(UsersModule).get(UsersService)).toBeDefined();
  });

  it('keeps LLM execution out of the API layer', () => {
    expect(existsSync(join(__dirname, 'llm'))).toBe(false);
  });
});
