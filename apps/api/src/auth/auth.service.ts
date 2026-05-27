import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { DatabaseService } from '../database/database.service';
import {
  buildDevConfirmationUrl,
  getDevConfirmationEnabled,
} from './auth.config';

export interface AuthUser {
  id: string;
  email: string;
  emailConfirmedAt: Date | null;
}

export interface RegisterInput {
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterResult {
  user: AuthUser;
  devConfirmationToken?: string;
  devConfirmationUrl?: string;
}

export interface LoginResult {
  user: AuthUser;
  accessToken: string;
}

export interface ResendConfirmationInput {
  email: string;
}

export interface ResendConfirmationResult {
  ok: true;
  devConfirmationToken?: string;
  devConfirmationUrl?: string;
}

interface AuthTokenPayload {
  sub?: unknown;
  email?: unknown;
}

const publicUserSelect = {
  id: true,
  email: true,
  emailConfirmedAt: true,
} as const;

const loginUserSelect = {
  id: true,
  email: true,
  passwordHash: true,
  emailConfirmedAt: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async register(input: RegisterInput): Promise<RegisterResult> {
    const email = this.normalizeEmail(input.email);
    const passwordHash = await hash(input.password);

    try {
      const user = await this.database.user.create({
        data: {
          email,
          passwordHash,
        },
        select: publicUserSelect,
      });
      const devConfirmationToken = await this.createConfirmationToken(user.id);

      return {
        user,
        ...this.createDevConfirmationFields(devConfirmationToken),
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Email is already registered.');
      }

      throw error;
    }
  }

  async confirmEmail(token: string): Promise<LoginResult> {
    const tokenHash = this.hashToken(token);
    const confirmation = await this.database.emailConfirmationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !confirmation ||
      confirmation.usedAt ||
      confirmation.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Confirmation token is invalid.');
    }

    await this.database.emailConfirmationToken.update({
      where: { id: confirmation.id },
      data: { usedAt: new Date() },
    });

    const user = await this.database.user.update({
      where: { id: confirmation.userId },
      data: { emailConfirmedAt: new Date() },
      select: publicUserSelect,
    });
    const accessToken = await this.signAccessToken(user);

    return {
      user,
      accessToken,
    };
  }

  async resendConfirmation(
    input: ResendConfirmationInput,
  ): Promise<ResendConfirmationResult> {
    const email = this.normalizeEmail(input.email);
    const user = await this.database.user.findUnique({
      where: { email },
      select: publicUserSelect,
    });

    if (!user || user.emailConfirmedAt) {
      return { ok: true };
    }

    const devConfirmationToken = await this.createConfirmationToken(user.id);
    return {
      ok: true,
      ...this.createDevConfirmationFields(devConfirmationToken),
    };
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const email = this.normalizeEmail(input.email);
    const user = await this.database.user.findUnique({
      where: { email },
      select: loginUserSelect,
    });

    if (!user || !user.emailConfirmedAt) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordIsValid = await this.verifyPassword(
      user.passwordHash,
      input.password,
    );

    if (!passwordIsValid) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const accessToken = await this.signAccessToken(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        emailConfirmedAt: user.emailConfirmedAt,
      },
      accessToken,
    };
  }

  async verifyPassword(
    passwordHash: string,
    password: string,
  ): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  async verifyAccessToken(token: string): Promise<AuthUser> {
    let payload: AuthTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AuthTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Session is invalid.');
    }

    if (typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Session is invalid.');
    }

    const user = await this.database.user.findUnique({
      where: { id: payload.sub },
      select: publicUserSelect,
    });

    if (!user) {
      throw new UnauthorizedException('Session is invalid.');
    }

    return user;
  }

  private async createConfirmationToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.database.emailConfirmationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return token;
  }

  private createDevConfirmationFields(
    token: string,
  ): Pick<RegisterResult, 'devConfirmationToken' | 'devConfirmationUrl'> {
    if (!getDevConfirmationEnabled()) {
      return {};
    }

    return {
      devConfirmationToken: token,
      devConfirmationUrl: buildDevConfirmationUrl(token),
    };
  }

  private signAccessToken(user: AuthUser): Promise<string> {
    return this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
