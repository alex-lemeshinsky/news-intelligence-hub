import { Module } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
