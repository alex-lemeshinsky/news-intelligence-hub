import { ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('allows access to resources owned by the current user', () => {
    const service = new UsersService();

    expect(() => service.assertOwnsResource('user_1', 'user_1')).not.toThrow();
  });

  it('rejects access to resources owned by another user', () => {
    const service = new UsersService();

    expect(() => service.assertOwnsResource('user_2', 'user_1')).toThrow(
      ForbiddenException,
    );
  });
});
