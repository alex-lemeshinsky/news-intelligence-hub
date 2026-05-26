import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
