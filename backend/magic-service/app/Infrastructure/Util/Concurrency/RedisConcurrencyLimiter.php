<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Util\Concurrency;

use Hyperf\Redis\Redis;

readonly class RedisConcurrencyLimiter
{
    public function __construct(
        private Redis $redis,
    ) {
    }

    public function tryAcquire(string $poolName, string $resourceId, int $maxConcurrency, int $ttlSeconds): ConcurrencyLease
    {
        if ($maxConcurrency <= 0) {
            return ConcurrencyLease::unlimited($resourceId);
        }

        $token = $this->newLeaseToken($resourceId);
        $lua = <<<'LUA'
        local running_key = KEYS[1]
        local token_key = KEYS[2]
        local resource_id = ARGV[1]
        local token = ARGV[2]
        local max_concurrency = tonumber(ARGV[3])
        local ttl_seconds = tonumber(ARGV[4])
        local now = tonumber(ARGV[5])
        local expires_at = now + ttl_seconds

        local expired_resource_ids = redis.call("zrangebyscore", running_key, "-inf", now)
        for _, expired_resource_id in ipairs(expired_resource_ids) do
            redis.call("hdel", token_key, expired_resource_id)
        end
        redis.call("zremrangebyscore", running_key, "-inf", now)

        if redis.call("hexists", token_key, resource_id) == 1 then
            return {0, ""}
        end
        if redis.call("zcard", running_key) >= max_concurrency then
            return {0, ""}
        end

        redis.call("hset", token_key, resource_id, token)
        redis.call("zadd", running_key, expires_at, resource_id)
        redis.call("expire", running_key, ttl_seconds)
        redis.call("expire", token_key, ttl_seconds)
        return {1, token}
        LUA;

        $result = $this->redis->eval(
            $lua,
            [
                $poolName,
                $this->tokenKey($poolName),
                $resourceId,
                $token,
                (string) $maxConcurrency,
                (string) $ttlSeconds,
                (string) time(),
            ],
            2
        );

        $status = (int) (is_array($result) ? ($result[0] ?? 0) : $result);
        return match ($status) {
            1 => ConcurrencyLease::acquired($poolName, $resourceId, (string) (is_array($result) ? ($result[1] ?? $token) : $token)),
            default => ConcurrencyLease::blocked($resourceId),
        };
    }

    public function release(ConcurrencyLease $lease): bool
    {
        if (! $lease->ownsSlot()) {
            return false;
        }

        $poolName = $lease->getPoolName();
        if ($poolName === '') {
            return false;
        }

        $lua = <<<'LUA'
        local running_key = KEYS[1]
        local token_key = KEYS[2]
        local resource_id = ARGV[1]
        local token = ARGV[2]

        if redis.call("hget", token_key, resource_id) ~= token then
            return 0
        end
        redis.call("hdel", token_key, resource_id)
        redis.call("zrem", running_key, resource_id)
        return 1
        LUA;

        return (bool) $this->redis->eval(
            $lua,
            [
                $poolName,
                $this->tokenKey($poolName),
                $lease->getResourceId(),
                $lease->getToken(),
            ],
            2
        );
    }

    private function tokenKey(string $poolName): string
    {
        return $poolName . ':tokens';
    }

    private function newLeaseToken(string $resourceId): string
    {
        return $resourceId . ':' . bin2hex(random_bytes(16));
    }
}
