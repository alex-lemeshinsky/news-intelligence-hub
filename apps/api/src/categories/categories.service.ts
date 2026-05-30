import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface CreateCategoryInput {
  name: string;
}

export interface UpdateCategoryInput {
  name?: string;
}

export const DEFAULT_CATEGORY_NAMES = [
  'AI infrastructure',
  'Crypto regulation',
  'DevTools',
  'Enterprise software',
] as const;

export const DEFAULT_CLASSIFICATION_AXES = [
  {
    name: 'Content type',
    values: ['Analysis', 'Launch', 'Funding', 'Regulation'],
  },
  {
    name: 'Reader level',
    values: ['Technical', 'Executive', 'General'],
  },
  {
    name: 'Region',
    values: ['Global', 'North America', 'Europe', 'Asia'],
  },
  {
    name: 'Tone',
    values: ['Positive', 'Neutral', 'Critical'],
  },
  {
    name: 'Market impact',
    values: ['High', 'Medium', 'Low'],
  },
] as const;

@Injectable()
export class CategoriesService {
  constructor(private readonly database: DatabaseService) {}

  list(userId: string) {
    return this.database.category.findMany({
      orderBy: { name: 'asc' },
      where: { userId },
    });
  }

  async create(userId: string, input: CreateCategoryInput) {
    try {
      return await this.database.category.create({
        data: {
          name: normalizeName(input.name),
          userId,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Category already exists.');
      }

      throw error;
    }
  }

  async update(userId: string, categoryId: string, input: UpdateCategoryInput) {
    const category = await this.findOwnedCategory(userId, categoryId);
    const data =
      input.name === undefined ? {} : { name: normalizeName(input.name) };

    try {
      return await this.database.category.update({
        data,
        where: { id: category.id },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Category already exists.');
      }

      throw error;
    }
  }

  async remove(userId: string, categoryId: string) {
    const category = await this.findOwnedCategory(userId, categoryId);
    return this.database.category.delete({
      where: { id: category.id },
    });
  }

  async seedDefaultConfiguration(userId: string): Promise<void> {
    await this.database.category.createMany({
      data: DEFAULT_CATEGORY_NAMES.map((name) => ({ name, userId })),
      skipDuplicates: true,
    });
    await this.database.classificationAxis.createMany({
      data: DEFAULT_CLASSIFICATION_AXES.map((axis) => ({
        name: axis.name,
        userId,
        values: [...axis.values],
      })),
      skipDuplicates: true,
    });
  }

  private async findOwnedCategory(userId: string, categoryId: string) {
    const category = await this.database.category.findFirst({
      where: {
        id: categoryId,
        userId,
      },
    });

    if (!category) {
      throw new NotFoundException('Category was not found.');
    }

    return category;
  }
}

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new BadRequestException('Category name is required.');
  }

  return normalized;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
