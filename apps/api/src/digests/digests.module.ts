import { Module } from '@nestjs/common';
import { DigestsService } from './digests.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [DigestsService],
  exports: [DigestsService],
})
export class DigestsModule {}
