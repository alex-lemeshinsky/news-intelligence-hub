import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { AUTHENTICATED_USER_KEY, CookieAuthGuard } from './cookie-auth.guard';
import type { AuthService, AuthUser } from './auth.service';

describe('CookieAuthGuard', () => {
  const user: AuthUser = {
    id: 'user_1',
    email: 'person@example.com',
    emailConfirmedAt: new Date('2026-05-27T10:00:00.000Z'),
  };

  const verifyAccessToken = jest.fn();
  const authService = {
    verifyAccessToken,
  } as unknown as AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_COOKIE_NAME = 'nih_access_token';
  });

  it('rejects requests without the auth cookie', async () => {
    const request = { cookies: {} };
    const guard = new CookieAuthGuard(authService);

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects requests for unconfirmed users', async () => {
    const request = { cookies: { nih_access_token: 'jwt-token' } };
    verifyAccessToken.mockResolvedValue({
      ...user,
      emailConfirmedAt: null,
    });
    const guard = new CookieAuthGuard(authService);

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches confirmed users to the request', async () => {
    const request = { cookies: { nih_access_token: 'jwt-token' } };
    verifyAccessToken.mockResolvedValue(user);
    const guard = new CookieAuthGuard(authService);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(verifyAccessToken).toHaveBeenCalledWith('jwt-token');
    expect(request[AUTHENTICATED_USER_KEY]).toBe(user);
  });
});

function contextFor(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}
