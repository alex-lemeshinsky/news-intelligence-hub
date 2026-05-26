import { Module } from '@nestjs/common';
import { AxesService } from './axes.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [AxesService],
  exports: [AxesService],
})
export class AxesModule {}
