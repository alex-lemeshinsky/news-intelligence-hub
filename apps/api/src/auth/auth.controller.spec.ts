import type { Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService, AuthUser } from './auth.service';

describe('AuthController', () => {
  const user: AuthUser = {
    id: 'user_1',
    email: 'person@example.com',
    emailConfirmedAt: new Date('2026-05-27T10:00:00.000Z'),
  };

  const login = jest.fn();
  const confirmEmail = jest.fn();
  const register = jest.fn();
  const resendConfirmation = jest.fn();
  const authService = {
    login,
    confirmEmail,
    register,
    resendConfirmation,
  } as unknown as AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_COOKIE_NAME = 'nih_access_token';
    process.env.AUTH_COOKIE_MAX_AGE_SECONDS = '86400';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_SECURE = 'false';
  });

  it('sets an HttpOnly auth cookie during login without returning the JWT body', async () => {
    login.mockResolvedValue({ user, accessToken: 'jwt-token' });
    const cookie = jest.fn();
    const response = {
      cookie,
    } as unknown as Response;
    const controller = new AuthController(authService);

    const result = await controller.login(
      {
        email: 'person@example.com',
        password: 'valid-password',
      },
      response,
    );

    expect(cookie).toHaveBeenCalledWith(
      'nih_access_token',
      'jwt-token',
      expect.objectContaining({
        httpOnly: true,
        maxAge: 86_400_000,
        path: '/',
        sameSite: 'lax',
        secure: false,
      }),
    );
    expect(result).toEqual({ user });
  });

  it('sets an auth cookie after email confirmation', async () => {
    confirmEmail.mockResolvedValue({ user, accessToken: 'jwt-token' });
    const cookie = jest.fn();
    const response = {
      cookie,
    } as unknown as Response;
    const controller = new AuthController(authService);

    const result = await controller.confirmEmail(
      { token: 'raw-token' },
      response,
    );

    expect(confirmEmail).toHaveBeenCalledWith('raw-token');
    expect(cookie).toHaveBeenCalledWith(
      'nih_access_token',
      'jwt-token',
      expect.any(Object),
    );
    expect(result).toEqual({ user });
  });

  it('clears the auth cookie during logout', () => {
    const clearCookie = jest.fn();
    const response = {
      clearCookie,
    } as unknown as Response;
    const controller = new AuthController(authService);

    const result = controller.logout(response);

    expect(clearCookie).toHaveBeenCalledWith(
      'nih_access_token',
      expect.objectContaining({
        path: '/',
        sameSite: 'lax',
        secure: false,
      }),
    );
    expect(result).toEqual({ ok: true });
  });
});
