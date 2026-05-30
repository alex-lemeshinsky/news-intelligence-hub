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

interface TokenUpdateArgs {
  where: { id: string };
  data: { usedAt: Date };
}

interface UserUpdateArgs {
  where: { id: string };
  data: { emailConfirmedAt: Date };
  select: object;
}

interface UserFindArgs {
  where: { id?: string; email?: string };
  select: object;
}

interface TokenFindArgs {
  where: { tokenHash: string };
  include: { user: boolean };
}

interface TokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  user: AuthUser;
}

describe('AuthService', () => {
  const originalEnv = process.env;
  const user = {
    id: 'user_1',
    email: 'person@example.com',
    passwordHash: '$argon2id$hash',
    emailConfirmedAt: new Date('2026-05-26T10:00:00.000Z'),
  };

  const createUser = jest.fn<Promise<AuthUser>, [UserCreateArgs]>();
  const findUser = jest.fn<Promise<unknown>, [UserFindArgs]>();
  const updateUser = jest.fn<Promise<AuthUser>, [UserUpdateArgs]>();
  const createToken = jest.fn<Promise<{ id: string }>, [TokenCreateArgs]>();
  const findToken = jest.fn<Promise<TokenRecord | null>, [TokenFindArgs]>();
  const updateToken = jest.fn<Promise<{ id: string }>, [TokenUpdateArgs]>();
  const createManyCategories = jest.fn<Promise<{ count: number }>, [object]>();
  const createManyAxes = jest.fn<Promise<{ count: number }>, [object]>();
  const signAsync = jest.fn<Promise<string>, [object]>();

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
    category: {
      createMany: createManyCategories,
    },
    classificationAxis: {
      createMany: createManyAxes,
    },
  };

  const jwtService = {
    signAsync,
  } as unknown as JwtService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      DEV_EMAIL_CONFIRMATION: 'true',
      WEB_ORIGIN: 'http://localhost:3000',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('registers a normalized email and returns a dev confirmation token', async () => {
    createUser.mockResolvedValue({
      ...user,
      email: 'person@example.com',
      emailConfirmedAt: null,
    });
    createToken.mockResolvedValue({ id: 'token_1' });
    createManyCategories.mockResolvedValue({ count: 4 });
    createManyAxes.mockResolvedValue({ count: 5 });

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
    expect(createManyCategories).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
      }),
    );
    expect(createManyAxes).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
      }),
    );
    expect(result.devConfirmationToken).toEqual(expect.any(String));
    expect(result.devConfirmationUrl).toEqual(
      expect.stringContaining('http://localhost:3000/confirm-email?token='),
    );
    expect(result.user.email).toBe('person@example.com');
  });

  it('hides dev confirmation values when dev mode is disabled', async () => {
    process.env.DEV_EMAIL_CONFIRMATION = 'false';
    createUser.mockResolvedValue({
      ...user,
      email: 'person@example.com',
      emailConfirmedAt: null,
    });
    createToken.mockResolvedValue({ id: 'token_1' });

    const service = new AuthService(database as never, jwtService);

    const result = await service.register({
      email: 'person@example.com',
      password: 'valid-password',
    });

    expect(createToken).toHaveBeenCalledTimes(1);
    expect(result.devConfirmationToken).toBeUndefined();
    expect(result.devConfirmationUrl).toBeUndefined();
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

  it('confirms email tokens and returns a signed session token', async () => {
    const unconfirmedUser = {
      ...user,
      emailConfirmedAt: null,
    };
    const confirmedAt = new Date('2026-05-27T10:00:00.000Z');

    findToken.mockResolvedValue({
      id: 'confirmation_1',
      userId: 'user_1',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      user: unconfirmedUser,
    });
    updateToken.mockResolvedValue({ id: 'confirmation_1' });
    updateUser.mockResolvedValue({
      ...user,
      emailConfirmedAt: confirmedAt,
    });
    signAsync.mockResolvedValue('jwt-token');

    const service = new AuthService(database as never, jwtService);

    const result = await service.confirmEmail('raw-token');

    expect(updateToken).toHaveBeenCalledWith({
      where: { id: 'confirmation_1' },
      data: { usedAt: expect.any(Date) as Date },
    });
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { emailConfirmedAt: expect.any(Date) as Date },
      select: expect.any(Object) as object,
    });
    const tokenUpdateCall = updateToken.mock.calls[0]?.[0] as
      | TokenUpdateArgs
      | undefined;
    const userUpdateCall = updateUser.mock.calls[0]?.[0] as
      | UserUpdateArgs
      | undefined;

    expect(tokenUpdateCall?.data.usedAt).toBeInstanceOf(Date);
    expect(userUpdateCall?.data.emailConfirmedAt).toBeInstanceOf(Date);
    expect(signAsync).toHaveBeenCalledWith({
      sub: 'user_1',
      email: 'person@example.com',
    });
    expect(result.accessToken).toBe('jwt-token');
    expect(result.user.emailConfirmedAt).toBe(confirmedAt);
  });

  it('resends confirmation without revealing whether an account exists', async () => {
    findUser.mockResolvedValue(null);

    const service = new AuthService(database as never, jwtService);

    const result = await service.resendConfirmation({
      email: 'missing@example.com',
    });

    expect(result).toEqual({ ok: true });
    expect(createToken).not.toHaveBeenCalled();
  });

  it('returns the current user from a valid access token', async () => {
    const verifyAsync = jest.fn().mockResolvedValue({ sub: 'user_1' });
    findUser.mockResolvedValue({
      id: 'user_1',
      email: 'person@example.com',
      emailConfirmedAt: user.emailConfirmedAt,
    });

    const service = new AuthService(
      database as never,
      {
        ...jwtService,
        verifyAsync,
      } as unknown as JwtService,
    );

    const result = await service.verifyAccessToken('jwt-token');

    expect(verifyAsync).toHaveBeenCalledWith('jwt-token');
    const findUserCall = findUser.mock.calls[0]?.[0] as
      | UserFindArgs
      | undefined;

    expect(findUserCall?.where).toEqual({ id: 'user_1' });
    expect(findUserCall?.select).toBeDefined();
    expect(result.id).toBe('user_1');
  });
});
