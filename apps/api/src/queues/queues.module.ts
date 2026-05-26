import { Module } from '@nestjs/common';
import { BullBoardService } from './bull-board.service';
import { QueuesService } from './queues.service';

@Module({
  providers: [QueuesService, BullBoardService],
  exports: [QueuesService],
})
export class QueuesModule {}
