import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { QueuesModule } from '../queues/queues.module';
import { DigestsController } from './digests.controller';
import { DigestsService } from './digests.service';

@Module({
  controllers: [DigestsController],
  imports: [AuthModule, DatabaseModule, QueuesModule],
  providers: [DigestsService],
  exports: [DigestsService],
})
export class DigestsModule {}
