import { createHash, randomUUID } from 'crypto';
import type { Redis } from 'ioredis';

const RELEASE_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end
`;

export interface CacheLockCoordinator {
  withLock<T>(key: string, work: () => Promise<T>): Promise<T>;
}

export class RedisCacheLockCoordinator implements CacheLockCoordinator {
  constructor(
    private readonly redis: Redis,
    private readonly options: {
      retryMs: number;
      ttlMs: number;
      waitMs: number;
    },
  ) {}

  async withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const lockKey = `llm-cache-lock:${hashKey(key)}`;
    const token = randomUUID();
    const deadline = Date.now() + this.options.waitMs;

    while (!(await this.acquire(lockKey, token))) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw new Error('Timed out waiting for LLM cache lock.');
      }

      await delay(Math.min(this.options.retryMs, remainingMs));
    }

    try {
      return await work();
    } finally {
      await this.release(lockKey, token);
    }
  }

  private async acquire(lockKey: string, token: string): Promise<boolean> {
    const result = await this.redis.set(
      lockKey,
      token,
      'PX',
      this.options.ttlMs,
      'NX',
    );
    return result === 'OK';
  }

  private async release(lockKey: string, token: string): Promise<void> {
    await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, token);
  }
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
