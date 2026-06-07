import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.service';
import { CookieAuthGuard } from '../auth/cookie-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TelemetryService } from './telemetry.service';

@Controller('telemetry')
@UseGuards(CookieAuthGuard)
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Get('llm')
  getLlmOverview(@CurrentUser() user: AuthUser) {
    return this.telemetryService.getLlmOverview(user.id);
  }
}
