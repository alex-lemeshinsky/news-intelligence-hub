import { Module } from '@nestjs/common';
import { AxesController } from './axes.controller';
import { AxesService } from './axes.service';
import { DatabaseModule } from '../database/database.module';
import { QueuesModule } from '../queues/queues.module';

@Module({
  controllers: [AxesController],
  imports: [DatabaseModule, QueuesModule],
  providers: [AxesService],
  exports: [AxesService],
})
export class AxesModule {}
