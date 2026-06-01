import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AxesService } from './axes.service';

describe('AxesService', () => {
  const createAxis = jest.fn();
  const deleteAxis = jest.fn();
  const findAxes = jest.fn();
  const findAxis = jest.fn();
  const updateAxis = jest.fn();

  const database = {
    classificationAxis: {
      create: createAxis,
      delete: deleteAxis,
      findFirst: findAxis,
      findMany: findAxes,
      update: updateAxis,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists only axes owned by the current user', async () => {
    findAxes.mockResolvedValue([
      {
        id: 'axis_1',
        name: 'Tone',
        values: ['Positive', 'Neutral'],
      },
    ]);
    const service = new AxesService(database as never);

    const axes = await service.list('user_1');

    expect(findAxes).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      where: { userId: 'user_1' },
    });
    expect(axes).toEqual([
      {
        id: 'axis_1',
        name: 'Tone',
        values: ['Positive', 'Neutral'],
      },
    ]);
  });

  it('creates an axis with trimmed unique values', async () => {
    createAxis.mockResolvedValue({
      id: 'axis_1',
      name: 'Market impact',
      values: ['High', 'Low'],
    });
    const service = new AxesService(database as never);

    await service.create('user_1', {
      name: ' Market impact ',
      values: [' High ', 'Low', 'high', ''],
    });

    expect(createAxis).toHaveBeenCalledWith({
      data: {
        name: 'Market impact',
        userId: 'user_1',
        values: ['High', 'Low'],
      },
    });
  });

  it('rejects axes without at least one value', async () => {
    const service = new AxesService(database as never);

    await expect(
      service.create('user_1', {
        name: 'Tone',
        values: ['  ', ''],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates an owned axis by user scope', async () => {
    findAxis.mockResolvedValue({ id: 'axis_1', userId: 'user_1' });
    updateAxis.mockResolvedValue({
      id: 'axis_1',
      name: 'Reader level',
      values: ['Technical'],
    });
    const service = new AxesService(database as never);

    await service.update('user_1', 'axis_1', {
      name: ' Reader level ',
      values: ['Technical', 'technical'],
    });

    expect(updateAxis).toHaveBeenCalledWith({
      data: {
        name: 'Reader level',
        values: ['Technical'],
      },
      where: { id: 'axis_1' },
    });
  });

  it('rejects updates outside the current tenant', async () => {
    findAxis.mockResolvedValue(null);
    const service = new AxesService(database as never);

    await expect(
      service.update('user_2', 'axis_1', { name: 'Tone' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes only an owned axis', async () => {
    findAxis.mockResolvedValue({ id: 'axis_1', userId: 'user_1' });
    deleteAxis.mockResolvedValue({ id: 'axis_1' });
    const service = new AxesService(database as never);

    await service.remove('user_1', 'axis_1');

    expect(deleteAxis).toHaveBeenCalledWith({
      where: { id: 'axis_1' },
    });
  });
});
