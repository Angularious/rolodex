// Redis abstraction backed by Upstash when configured, otherwise an in-memory
// store. The in-memory fallback only spans a single server instance/process —
// fine for local dev, NOT for multi-instance production. Set UPSTASH_REDIS_*
// env vars on Vercel for real cross-instance cache/rate-limit/spend state.

import { Redis } from '@upstash/redis';

export interface KV {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  incr(key: string, ttlSeconds?: number): Promise<number>;
  incrByFloat(key: string, amount: number, ttlSeconds?: number): Promise<number>;
  ttl(key: string): Promise<number>;
  // Set key only if absent. Returns true if the lock was acquired.
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  del(key: string): Promise<void>;
  // Push onto a capped list (newest first), used for the analytics event log.
  pushCapped(key: string, value: unknown, max: number): Promise<void>;
  list<T = unknown>(key: string, limit: number): Promise<T[]>;
}

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------
type Entry = { value: unknown; expiresAt: number | null };

class MemoryKV implements KV {
  private store = new Map<string, Entry>();
  private lists = new Map<string, { items: unknown[]; expiresAt: number | null }>();

  private alive(e: Entry | undefined): e is Entry {
    if (!e) return false;
    if (e.expiresAt !== null && e.expiresAt < Date.now()) return false;
    return true;
  }

  async get<T>(key: string): Promise<T | null> {
    const e = this.store.get(key);
    if (!this.alive(e)) {
      this.store.delete(key);
      return null;
    }
    return e!.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const cur = (await this.get<number>(key)) ?? 0;
    const next = cur + 1;
    const existing = this.store.get(key);
    const expiresAt =
      existing && this.alive(existing) && existing.expiresAt !== null
        ? existing.expiresAt
        : ttlSeconds
          ? Date.now() + ttlSeconds * 1000
          : null;
    this.store.set(key, { value: next, expiresAt });
    return next;
  }

  async incrByFloat(key: string, amount: number, ttlSeconds?: number): Promise<number> {
    const cur = (await this.get<number>(key)) ?? 0;
    const next = Math.round((cur + amount) * 100) / 100;
    const existing = this.store.get(key);
    const expiresAt =
      existing && this.alive(existing) && existing.expiresAt !== null
        ? existing.expiresAt
        : ttlSeconds
          ? Date.now() + ttlSeconds * 1000
          : null;
    this.store.set(key, { value: next, expiresAt });
    return next;
  }

  async ttl(key: string): Promise<number> {
    const e = this.store.get(key);
    if (!this.alive(e)) return -2;
    if (e!.expiresAt === null) return -1;
    return Math.ceil((e!.expiresAt - Date.now()) / 1000);
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const e = this.store.get(key);
    if (this.alive(e)) return false;
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async pushCapped(key: string, value: unknown, max: number): Promise<void> {
    const cur = this.lists.get(key) ?? { items: [], expiresAt: null };
    cur.items.unshift(value);
    if (cur.items.length > max) cur.items.length = max;
    this.lists.set(key, cur);
  }

  async list<T>(key: string, limit: number): Promise<T[]> {
    const cur = this.lists.get(key);
    if (!cur) return [];
    return cur.items.slice(0, limit) as T[];
  }
}

// ---------------------------------------------------------------------------
// Upstash-backed implementation
// ---------------------------------------------------------------------------
class UpstashKV implements KV {
  constructor(private redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    return (await this.redis.get<T>(key)) ?? null;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) await this.redis.set(key, value, { ex: ttlSeconds });
    else await this.redis.set(key, value);
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const n = await this.redis.incr(key);
    if (n === 1 && ttlSeconds) await this.redis.expire(key, ttlSeconds);
    return n;
  }

  async incrByFloat(key: string, amount: number, ttlSeconds?: number): Promise<number> {
    const n = await this.redis.incrbyfloat(key, amount);
    const val = typeof n === 'number' ? n : parseFloat(String(n));
    if (ttlSeconds) {
      const t = await this.redis.ttl(key);
      if (t < 0) await this.redis.expire(key, ttlSeconds);
    }
    return Math.round(val * 100) / 100;
  }

  async ttl(key: string): Promise<number> {
    return this.redis.ttl(key);
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const res = await this.redis.set(key, value, { nx: true, ex: ttlSeconds });
    return res === 'OK';
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async pushCapped(key: string, value: unknown, max: number): Promise<void> {
    await this.redis.lpush(key, JSON.stringify(value));
    await this.redis.ltrim(key, 0, max - 1);
  }

  async list<T>(key: string, limit: number): Promise<T[]> {
    const items = await this.redis.lrange<string>(key, 0, limit - 1);
    return items.map((i) => (typeof i === 'string' ? JSON.parse(i) : i)) as T[];
  }
}

let _kv: KV | null = null;

export function kv(): KV {
  if (_kv) return _kv;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    _kv = new UpstashKV(new Redis({ url, token }));
  } else {
    _kv = new MemoryKV();
  }
  return _kv;
}

export function isPersistent(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}
