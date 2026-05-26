import { Module } from '@nestjs/common';
import { FeedsService } from './feeds.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [FeedsService],
  exports: [FeedsService],
})
export class FeedsModule {}
