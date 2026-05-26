import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { DatabaseService } from '../database/database.service';

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
}

export interface LoginResult {
  user: AuthUser;
  accessToken: string;
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
        devConfirmationToken,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Email is already registered.');
      }

      throw error;
    }
  }

  async confirmEmail(token: string): Promise<AuthUser> {
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

    return this.database.user.update({
      where: { id: confirmation.userId },
      data: { emailConfirmedAt: new Date() },
      select: publicUserSelect,
    });
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

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

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
