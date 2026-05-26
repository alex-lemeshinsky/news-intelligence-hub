import { Module } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [ArticlesService],
  exports: [ArticlesService],
})
export class ArticlesModule {}
