import type { AuthUser } from '../auth/auth.service';
import { DigestsController } from './digests.controller';
import type { DigestsService } from './digests.service';

describe('DigestsController', () => {
  const user: AuthUser = {
    email: 'person@example.com',
    emailConfirmedAt: new Date('2026-05-27T10:00:00.000Z'),
    id: 'user_1',
  };
  const create = jest.fn();
  const get = jest.fn();
  const list = jest.fn();
  const service = {
    create,
    get,
    list,
  } as unknown as DigestsService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists digests for the authenticated user', () => {
    const controller = new DigestsController(service);

    void controller.list(user);

    expect(list).toHaveBeenCalledWith('user_1');
  });

  it('creates digests for the authenticated user', () => {
    const controller = new DigestsController(service);
    const body = {
      categoryIds: ['category_1'],
      entityIds: ['entity_1'],
      period: 'week',
    };

    void controller.create(user, body);

    expect(create).toHaveBeenCalledWith('user_1', body);
  });

  it('reads one digest for the authenticated user', () => {
    const controller = new DigestsController(service);

    void controller.get(user, 'digest_1');

    expect(get).toHaveBeenCalledWith('user_1', 'digest_1');
  });
});
