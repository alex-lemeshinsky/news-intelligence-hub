import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ArticlesModule } from './articles/articles.module';
import { AuthModule } from './auth/auth.module';
import { AxesModule } from './axes/axes.module';
import { CategoriesModule } from './categories/categories.module';
import { DatabaseModule } from './database/database.module';
import { DigestsModule } from './digests/digests.module';
import { FeedsModule } from './feeds/feeds.module';
import { GraphModule } from './graph/graph.module';
import { QueuesModule } from './queues/queues.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    FeedsModule,
    CategoriesModule,
    AxesModule,
    ArticlesModule,
    QueuesModule,
    GraphModule,
    TelemetryModule,
    DigestsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
