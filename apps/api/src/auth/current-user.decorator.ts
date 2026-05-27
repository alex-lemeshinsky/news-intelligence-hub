import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AUTHENTICATED_USER_KEY,
  AuthenticatedRequest,
} from './cookie-auth.guard';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request[AUTHENTICATED_USER_KEY];

    if (!user) {
      throw new UnauthorizedException('Authentication is required.');
    }

    return user;
  },
);
