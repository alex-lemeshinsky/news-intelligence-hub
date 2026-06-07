import type { AuthUser } from '../auth/auth.service';
import { TelemetryController } from './telemetry.controller';
import type { TelemetryService } from './telemetry.service';

describe('TelemetryController', () => {
  const user: AuthUser = {
    id: 'user_1',
    email: 'person@example.com',
    emailConfirmedAt: new Date('2026-05-27T10:00:00.000Z'),
  };

  const getLlmOverview = jest.fn();
  const telemetryService = {
    getLlmOverview,
  } as unknown as TelemetryService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns LLM telemetry for the authenticated user', () => {
    const controller = new TelemetryController(telemetryService);

    void controller.getLlmOverview(user);

    expect(getLlmOverview).toHaveBeenCalledWith('user_1');
  });
});
