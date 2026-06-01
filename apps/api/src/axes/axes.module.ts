import { Module } from '@nestjs/common';
import { AxesController } from './axes.controller';
import { AxesService } from './axes.service';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { QueuesModule } from '../queues/queues.module';

@Module({
  controllers: [AxesController],
  imports: [AuthModule, DatabaseModule, QueuesModule],
  providers: [AxesService],
  exports: [AxesService],
})
export class AxesModule {}
