import { ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class UsersService {
  assertOwnsResource(resourceUserId: string, currentUserId: string): void {
    if (resourceUserId !== currentUserId) {
      throw new ForbiddenException('Resource belongs to another user.');
    }
  }
}
