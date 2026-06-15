<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Design\Service;

use App\Application\Design\Service\DesignImageOperationConcurrencyService;
use App\Application\Design\Service\DesignImageOperationLease;
use App\Domain\Design\Entity\ImageGenerationEntity;
use App\Domain\Design\Entity\ValueObject\ImageGenerationType;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Redis\Redis;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
final class DesignImageOperationConcurrencyServiceTest extends TestCase
{
    public function testTryAcquireUsesSharedEraserExpandRunningPool(): void
    {
        $entity = $this->createEntity(123456, ImageGenerationType::ERASER);
        $redis = new RecordingRedis();
        $config = $this->createConfig(2, 600);

        $service = new DesignImageOperationConcurrencyService($redis, $config);

        $lease = $service->tryAcquire($entity);

        $this->assertTrue($lease->canProceed());
        $this->assertTrue($lease->ownsSlot());
        $this->assertSame(1, $redis->evalCalls);
        $this->assertStringContainsString('zremrangebyscore', $redis->evalScript);
        $this->assertStringContainsString('hset', $redis->evalScript);
        $this->assertStringContainsString('zcard', $redis->evalScript);
        $this->assertSame(2, $redis->evalKeyCount);
        $this->assertSame('design:image-operation:running:eraser-expand', $redis->evalArguments[0]);
        $this->assertSame('design:image-operation:running:eraser-expand:tokens', $redis->evalArguments[1]);
        $this->assertSame((string) $entity->getId(), $redis->evalArguments[2]);
        $this->assertStringStartsWith($entity->getId() . ':', $redis->evalArguments[3]);
        $this->assertSame('2', $redis->evalArguments[4]);
        $this->assertSame('600', $redis->evalArguments[5]);
        $this->assertIsNumeric($redis->evalArguments[6]);
        $this->assertSame($redis->evalArguments[3], $lease->getToken());
    }

    public function testTryAcquireSkipsRedisWhenLimitDisabled(): void
    {
        $entity = $this->createEntity(123456, ImageGenerationType::EXPAND);
        $redis = new RecordingRedis();
        $config = $this->createConfig(0, 600);

        $service = new DesignImageOperationConcurrencyService($redis, $config);

        $lease = $service->tryAcquire($entity);

        $this->assertTrue($lease->canProceed());
        $this->assertFalse($lease->ownsSlot());
        $this->assertSame(0, $redis->evalCalls);
    }

    public function testTryAcquireDoesNotProceedWhenTaskAlreadyHasLease(): void
    {
        $entity = $this->createEntity(123456, ImageGenerationType::ERASER);
        $redis = new RecordingRedis();
        $redis->evalResult = [2, ''];
        $config = $this->createConfig(2, 600);

        $service = new DesignImageOperationConcurrencyService($redis, $config);

        $lease = $service->tryAcquire($entity);

        $this->assertFalse($lease->canProceed());
        $this->assertFalse($lease->ownsSlot());
    }

    public function testReleaseOnlyDeletesMatchingLeaseToken(): void
    {
        $lease = DesignImageOperationLease::acquired(123456, 'lease-token');
        $redis = new RecordingRedis();
        $redis->evalResult = 1;
        $config = $this->createConfig(2, 600);

        $service = new DesignImageOperationConcurrencyService($redis, $config);
        $this->assertTrue($service->release($lease));

        $this->assertSame(1, $redis->evalCalls);
        $this->assertStringContainsString('hget', $redis->evalScript);
        $this->assertStringContainsString('zrem', $redis->evalScript);
        $this->assertSame(2, $redis->evalKeyCount);
        $this->assertSame('design:image-operation:running:eraser-expand', $redis->evalArguments[0]);
        $this->assertSame('design:image-operation:running:eraser-expand:tokens', $redis->evalArguments[1]);
        $this->assertSame('123456', $redis->evalArguments[2]);
        $this->assertSame('lease-token', $redis->evalArguments[3]);
    }

    public function testRenewTouchesMatchingLeaseToken(): void
    {
        $lease = DesignImageOperationLease::acquired(123456, 'lease-token');
        $redis = new RecordingRedis();
        $redis->evalResult = 1;
        $config = $this->createConfig(2, 600);

        $service = new DesignImageOperationConcurrencyService($redis, $config);

        $this->assertTrue($service->renew($lease));

        $this->assertSame(1, $redis->evalCalls);
        $this->assertStringContainsString('zadd', $redis->evalScript);
        $this->assertSame('123456', $redis->evalArguments[2]);
        $this->assertSame('lease-token', $redis->evalArguments[3]);
    }

    private function createEntity(int $id, ImageGenerationType $type): ImageGenerationEntity
    {
        $entity = new ImageGenerationEntity();
        $entity->setId($id);
        $entity->setType($type);

        return $entity;
    }

    private function createConfig(int $limit, int $ttlSeconds): ConfigInterface
    {
        $config = $this->createMock(ConfigInterface::class);
        $config->method('get')
            ->willReturnCallback(static function (string $key, mixed $default = null) use ($limit, $ttlSeconds): mixed {
                return match ($key) {
                    'design_image_operation.max_concurrency' => $limit,
                    'design_image_operation.slot_ttl_seconds' => $ttlSeconds,
                    default => $default,
                };
            });

        return $config;
    }
}

final class RecordingRedis extends Redis
{
    public int $evalCalls = 0;

    public mixed $evalResult = null;

    public string $evalScript = '';

    /**
     * @var list<mixed>
     */
    public array $evalArguments = [];

    public int $evalKeyCount = 0;

    public function __construct()
    {
    }

    /**
     * @param list<mixed> $arguments
     */
    public function eval(string $script, array $arguments = [], int $keyCount = 0): mixed
    {
        ++$this->evalCalls;
        $this->evalScript = $script;
        $this->evalArguments = $arguments;
        $this->evalKeyCount = $keyCount;

        return $this->evalResult ?? [1, $arguments[3] ?? ''];
    }
}
