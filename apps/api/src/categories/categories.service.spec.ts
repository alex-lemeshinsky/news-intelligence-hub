import { NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  const createCategory = jest.fn();
  const createManyCategories = jest.fn<
    Promise<{ count: number }>,
    [CreateManyArgs]
  >();
  const createManyAxes = jest.fn<
    Promise<{ count: number }>,
    [CreateManyArgs]
  >();
  const deleteCategory = jest.fn();
  const findCategories = jest.fn();
  const findCategory = jest.fn();
  const updateCategory = jest.fn();

  const database = {
    category: {
      create: createCategory,
      createMany: createManyCategories,
      delete: deleteCategory,
      findFirst: findCategory,
      findMany: findCategories,
      update: updateCategory,
    },
    classificationAxis: {
      createMany: createManyAxes,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('seeds default categories and editable axes for a new user', async () => {
    createManyCategories.mockResolvedValue({ count: 4 });
    createManyAxes.mockResolvedValue({ count: 5 });
    const service = new CategoriesService(database as never);

    await service.seedDefaultConfiguration('user_1');

    const categoryCall = createManyCategories.mock.calls[0]?.[0];
    const axisCall = createManyAxes.mock.calls[0]?.[0];

    expect(categoryCall?.skipDuplicates).toBe(true);
    expect(categoryCall?.data).toEqual(
      expect.arrayContaining([
        { name: 'AI infrastructure', userId: 'user_1' },
        { name: 'Crypto regulation', userId: 'user_1' },
      ]),
    );
    expect(axisCall?.skipDuplicates).toBe(true);
    const contentType = axisCall?.data.find(
      (axis) => axis.name === 'Content type',
    );
    const readerLevel = axisCall?.data.find(
      (axis) => axis.name === 'Reader level',
    );
    expect(contentType?.userId).toBe('user_1');
    expect(contentType?.values).toEqual(
      expect.arrayContaining(['Analysis', 'Launch']),
    );
    expect(readerLevel?.userId).toBe('user_1');
    expect(readerLevel?.values).toEqual(
      expect.arrayContaining(['Technical', 'Executive']),
    );
  });

  it('lists only categories owned by the current user', async () => {
    findCategories.mockResolvedValue([{ id: 'cat_1', name: 'AI infra' }]);
    const service = new CategoriesService(database as never);

    const categories = await service.list('user_1');

    expect(findCategories).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      where: { userId: 'user_1' },
    });
    expect(categories).toEqual([{ id: 'cat_1', name: 'AI infra' }]);
  });

  it('updates an owned category by user scope', async () => {
    findCategory.mockResolvedValue({ id: 'cat_1', userId: 'user_1' });
    updateCategory.mockResolvedValue({ id: 'cat_1', name: 'DevTools' });
    const service = new CategoriesService(database as never);

    await service.update('user_1', 'cat_1', { name: ' DevTools ' });

    expect(updateCategory).toHaveBeenCalledWith({
      data: { name: 'DevTools' },
      where: { id: 'cat_1' },
    });
  });

  it('rejects updates outside the current tenant', async () => {
    findCategory.mockResolvedValue(null);
    const service = new CategoriesService(database as never);

    await expect(
      service.update('user_2', 'cat_1', { name: 'Other' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

interface CreateManyArgs {
  data: Array<{
    name: string;
    userId: string;
    values?: string[];
  }>;
  skipDuplicates: boolean;
}
