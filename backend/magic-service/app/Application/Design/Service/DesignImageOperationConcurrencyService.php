<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Design\Service;

use App\Domain\Design\Entity\ImageGenerationEntity;
use App\Domain\Design\Entity\ValueObject\ImageGenerationType;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Redis\Redis;

readonly class DesignImageOperationConcurrencyService
{
    private const RUNNING_KEY = 'design:image-operation:running:eraser-expand';

    private const TOKEN_KEY = 'design:image-operation:running:eraser-expand:tokens';

    public function __construct(
        private Redis $redis,
        private ConfigInterface $config,
    ) {
    }

    public function supports(ImageGenerationEntity $entity): bool
    {
        return in_array($entity->getType(), [ImageGenerationType::ERASER, ImageGenerationType::EXPAND], true);
    }

    public function tryAcquire(ImageGenerationEntity $entity): DesignImageOperationLease
    {
        $limit = $this->maxConcurrency();
        if ($limit <= 0) {
            return DesignImageOperationLease::unlimited($entity->getId());
        }

        $token = $this->newLeaseToken($entity);
        $lua = <<<'LUA'
        local expired_task_ids = redis.call("zrangebyscore", KEYS[1], "-inf", tonumber(ARGV[5]) - tonumber(ARGV[4]))
        for _, task_id in ipairs(expired_task_ids) do
            redis.call("hdel", KEYS[2], task_id)
        end
        redis.call("zremrangebyscore", KEYS[1], "-inf", tonumber(ARGV[5]) - tonumber(ARGV[4]))

        if redis.call("hexists", KEYS[2], ARGV[1]) == 1 then
            redis.call("expire", KEYS[1], ARGV[4])
            redis.call("expire", KEYS[2], ARGV[4])
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
                self::RUNNING_KEY,
                self::TOKEN_KEY,
                (string) $entity->getId(),
                $token,
                (string) $limit,
                (string) $this->slotTtlSeconds(),
                (string) time(),
            ],
            2
        );

        $status = (int) (is_array($result) ? ($result[0] ?? 0) : $result);
        return match ($status) {
            1 => DesignImageOperationLease::acquired($entity->getId(), (string) (is_array($result) ? ($result[1] ?? $token) : $token)),
            2 => DesignImageOperationLease::alreadyRunning($entity->getId()),
            default => DesignImageOperationLease::rejected($entity->getId()),
        };
    }

    public function renew(DesignImageOperationLease $lease): bool
    {
        if (! $lease->ownsSlot()) {
            return false;
        }

        $lua = <<<'LUA'
        if redis.call("hget", KEYS[2], ARGV[1]) ~= ARGV[2] then
            return 0
        end
        redis.call("zadd", KEYS[1], ARGV[4], ARGV[1])
        redis.call("expire", KEYS[1], ARGV[3])
        redis.call("expire", KEYS[2], ARGV[3])
        return 1
        LUA;

        return (bool) $this->redis->eval(
            $lua,
            [
                self::RUNNING_KEY,
                self::TOKEN_KEY,
                (string) $lease->getTaskId(),
                $lease->getToken(),
                (string) $this->slotTtlSeconds(),
                (string) time(),
            ],
            2
        );
    }

    public function release(DesignImageOperationLease $lease): bool
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
                self::RUNNING_KEY,
                self::TOKEN_KEY,
                (string) $lease->getTaskId(),
                $lease->getToken(),
            ],
            2
        );
    }

    public function renewIntervalSeconds(): int
    {
        return max(1, min(60, intdiv($this->slotTtlSeconds(), 3)));
    }

    private function maxConcurrency(): int
    {
        return (int) $this->config->get('design_image_operation.max_concurrency', 2);
    }

    private function slotTtlSeconds(): int
    {
        return (int) $this->config->get('design_image_operation.slot_ttl_seconds', 600);
    }

    private function newLeaseToken(ImageGenerationEntity $entity): string
    {
        return $entity->getId() . ':' . bin2hex(random_bytes(16));
    }
}
