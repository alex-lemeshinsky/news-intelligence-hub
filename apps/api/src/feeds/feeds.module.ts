import { Module } from '@nestjs/common';
import { FeedValidationService } from './feed-validation.service';
import { FeedsController } from './feeds.controller';
import { FeedsService } from './feeds.service';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { QueuesModule } from '../queues/queues.module';

@Module({
  imports: [AuthModule, DatabaseModule, QueuesModule],
  controllers: [FeedsController],
  providers: [FeedsService, FeedValidationService],
  exports: [FeedsService],
})
export class FeedsModule {}
