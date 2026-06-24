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
        local expired_resource_ids = redis.call("zrangebyscore", KEYS[1], "-inf", tonumber(ARGV[5]) - tonumber(ARGV[4]))
        for _, resource_id in ipairs(expired_resource_ids) do
            redis.call("hdel", KEYS[2], resource_id)
        end
        redis.call("zremrangebyscore", KEYS[1], "-inf", tonumber(ARGV[5]) - tonumber(ARGV[4]))

        if redis.call("hexists", KEYS[2], ARGV[1]) == 1 then
            return {2, ""}
        end
        if redis.call("zcard", KEYS[1]) >= tonumber(ARGV[3]) then
            return {0, ""}
        end

        redis.call("hset", KEYS[2], ARGV[1], ARGV[2])
        redis.call("zadd", KEYS[1], ARGV[5], ARGV[1])
        redis.call("expire", KEYS[1], ARGV[4])
        redis.call("expire", KEYS[2], ARGV[4])
        return {1, ARGV[2]}
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
            1 => ConcurrencyLease::acquired($resourceId, (string) (is_array($result) ? ($result[1] ?? $token) : $token)),
            default => ConcurrencyLease::blocked($resourceId),
        };
    }

    public function release(ConcurrencyLease $lease, string $poolName): bool
    {
        if (! $lease->ownsSlot()) {
            return false;
        }

        $lua = <<<'LUA'
        if redis.call("hget", KEYS[2], ARGV[1]) ~= ARGV[2] then
            return 0
        end
        redis.call("hdel", KEYS[2], ARGV[1])
        redis.call("zrem", KEYS[1], ARGV[1])
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
