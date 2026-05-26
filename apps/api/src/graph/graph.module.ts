import { Module } from '@nestjs/common';
import { GraphService } from './graph.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [GraphService],
  exports: [GraphService],
})
export class GraphModule {}
