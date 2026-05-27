import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { getAuthCookieName } from './auth.config';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.service';

export const AUTHENTICATED_USER_KEY = 'authenticatedUser';

export interface AuthenticatedRequest extends Request {
  [AUTHENTICATED_USER_KEY]?: AuthUser;
  cookies: Record<string, string | undefined>;
}

@Injectable()
export class CookieAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[getAuthCookieName()];

    if (!token) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const user = await this.authService.verifyAccessToken(token);
    if (!user.emailConfirmedAt) {
      throw new UnauthorizedException('Email confirmation is required.');
    }

    request[AUTHENTICATED_USER_KEY] = user;
    return true;
  }
}
