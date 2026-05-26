import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService, AuthUser } from './auth.service';

interface UserCreateArgs {
  data: { email: string; passwordHash: string };
  select: object;
}

interface TokenCreateArgs {
  data: { userId: string; tokenHash: string; expiresAt: Date };
}

describe('AuthService', () => {
  const user = {
    id: 'user_1',
    email: 'person@example.com',
    passwordHash: '$argon2id$hash',
    emailConfirmedAt: new Date('2026-05-26T10:00:00.000Z'),
  };

  const createUser = jest.fn<Promise<AuthUser>, [UserCreateArgs]>();
  const findUser = jest.fn();
  const updateUser = jest.fn();
  const createToken = jest.fn<Promise<{ id: string }>, [TokenCreateArgs]>();
  const findToken = jest.fn();
  const updateToken = jest.fn();
  const signAsync = jest.fn();

  const database = {
    user: {
      create: createUser,
      findUnique: findUser,
      update: updateUser,
    },
    emailConfirmationToken: {
      create: createToken,
      findUnique: findToken,
      update: updateToken,
    },
  };

  const jwtService = {
    signAsync,
  } as unknown as JwtService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers a normalized email and returns a dev confirmation token', async () => {
    createUser.mockResolvedValue({
      ...user,
      email: 'person@example.com',
      emailConfirmedAt: null,
    });
    createToken.mockResolvedValue({ id: 'token_1' });

    const service = new AuthService(database as never, jwtService);

    const result = await service.register({
      email: ' Person@Example.COM ',
      password: 'valid-password',
    });

    const userCreateCall = createUser.mock.calls[0]?.[0];
    const tokenCreateCall = createToken.mock.calls[0]?.[0];

    expect(userCreateCall?.data.email).toBe('person@example.com');
    expect(userCreateCall?.data.passwordHash).toMatch(/^\$argon2/);
    expect(userCreateCall?.select).toBeDefined();
    expect(tokenCreateCall?.data.userId).toBe('user_1');
    expect(tokenCreateCall?.data.tokenHash).toEqual(expect.any(String));
    expect(tokenCreateCall?.data.expiresAt).toBeInstanceOf(Date);
    expect(result.devConfirmationToken).toEqual(expect.any(String));
    expect(result.user.email).toBe('person@example.com');
  });

  it('rejects login until email is confirmed', async () => {
    findUser.mockResolvedValue({
      ...user,
      emailConfirmedAt: null,
    });

    const service = new AuthService(database as never, jwtService);

    await expect(
      service.login({
        email: 'person@example.com',
        password: 'valid-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logs in confirmed users with a JWT access token', async () => {
    findUser.mockResolvedValue(user);
    signAsync.mockResolvedValue('jwt-token');

    const service = new AuthService(database as never, jwtService);
    jest.spyOn(service, 'verifyPassword').mockResolvedValue(true);

    const result = await service.login({
      email: 'person@example.com',
      password: 'valid-password',
    });

    expect(signAsync).toHaveBeenCalledWith({
      sub: 'user_1',
      email: 'person@example.com',
    });
    expect(result.accessToken).toBe('jwt-token');
  });
});
