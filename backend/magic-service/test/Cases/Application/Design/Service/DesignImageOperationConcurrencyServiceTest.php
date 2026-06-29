<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Design\Service;

use App\Application\Design\Service\DesignImageOperationConcurrencyService;
use App\Domain\Design\Entity\ImageGenerationEntity;
use App\Domain\Design\Entity\ValueObject\ImageGenerationType;
use App\Domain\Provider\Entity\ValueObject\AiAbilityCode;
use App\Domain\Provider\Service\AiAbilityDomainService;
use App\Infrastructure\Util\Concurrency\ConcurrencyLease;
use App\Infrastructure\Util\Concurrency\RedisConcurrencyLimiter;
use Hyperf\Redis\Redis;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
final class DesignImageOperationConcurrencyServiceTest extends TestCase
{
    public function testTryAcquireUsesAbilityConcurrentAndAbilityRunningPool(): void
    {
        $entity = $this->createEntity(123456, ImageGenerationType::ERASER);
        $redis = new RecordingRedis();
        $aiAbilityDomainService = $this->createAiAbilityDomainService(
            AiAbilityCode::ImageEraser,
            $this->createProviderConfig(['concurrent' => 2]),
        );

        $service = new DesignImageOperationConcurrencyService(new RedisConcurrencyLimiter($redis), $aiAbilityDomainService);

        $lease = $service->tryAcquire($entity);

        $this->assertTrue($lease->canProceed());
        $this->assertTrue($lease->ownsSlot());
        $this->assertSame(1, $redis->evalCalls);
        $this->assertStringContainsString('zremrangebyscore', $redis->evalScript);
        $this->assertStringContainsString('hset', $redis->evalScript);
        $this->assertStringContainsString('zcard', $redis->evalScript);
        $this->assertSame(2, $redis->evalKeyCount);
        $this->assertSame('design:image-operation:running:image_eraser', $redis->evalArguments[0]);
        $this->assertSame('design:image-operation:running:image_eraser:tokens', $redis->evalArguments[1]);
        $this->assertSame((string) $entity->getId(), $redis->evalArguments[2]);
        $this->assertStringStartsWith($entity->getId() . ':', $redis->evalArguments[3]);
        $this->assertSame('2', $redis->evalArguments[4]);
        $this->assertSame('60', $redis->evalArguments[5]);
        $this->assertIsNumeric($redis->evalArguments[6]);
        $this->assertSame($redis->evalArguments[3], $lease->getToken());
        $this->assertSame('design:image-operation:running:image_eraser', $lease->getPoolName());
    }

    public function testTryAcquireSkipsRedisWhenAbilityConcurrentIsEmpty(): void
    {
        $entity = $this->createEntity(123456, ImageGenerationType::EXPAND);
        $redis = new RecordingRedis();
        $aiAbilityDomainService = $this->createAiAbilityDomainService(
            AiAbilityCode::ImageExpand,
            $this->createProviderConfig(['concurrent' => '']),
        );

        $service = new DesignImageOperationConcurrencyService(new RedisConcurrencyLimiter($redis), $aiAbilityDomainService);

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
        $aiAbilityDomainService = $this->createAiAbilityDomainService(
            AiAbilityCode::ImageEraser,
            $this->createProviderConfig(['concurrent' => 2]),
        );

        $service = new DesignImageOperationConcurrencyService(new RedisConcurrencyLimiter($redis), $aiAbilityDomainService);

        $lease = $service->tryAcquire($entity);

        $this->assertFalse($lease->canProceed());
        $this->assertFalse($lease->ownsSlot());
    }

    public function testReleaseOnlyDeletesMatchingLeaseToken(): void
    {
        $lease = ConcurrencyLease::acquired('design:image-operation:running:image_expand', '123456', 'lease-token');
        $redis = new RecordingRedis();
        $redis->evalResult = 1;
        $aiAbilityDomainService = $this->createAiAbilityDomainService(AiAbilityCode::ImageExpand, [], 0);

        $service = new DesignImageOperationConcurrencyService(new RedisConcurrencyLimiter($redis), $aiAbilityDomainService);
        $this->assertTrue($service->release($lease));

        $this->assertSame(1, $redis->evalCalls);
        $this->assertStringContainsString('hget', $redis->evalScript);
        $this->assertStringContainsString('zrem', $redis->evalScript);
        $this->assertSame(2, $redis->evalKeyCount);
        $this->assertSame('design:image-operation:running:image_expand', $redis->evalArguments[0]);
        $this->assertSame('design:image-operation:running:image_expand:tokens', $redis->evalArguments[1]);
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

    private function createProviderConfig(array $providerConfig): array
    {
        return [
            'providers' => [
                [
                    'provider' => 'jimeng',
                    'enable' => true,
                ] + $providerConfig,
                [
                    'provider' => 'official_proxy',
                    'enable' => false,
                    'concurrent' => 99,
                ],
            ],
        ];
    }

    private function createAiAbilityDomainService(AiAbilityCode $expectedCode, array $config, int $expectedReads = 1): AiAbilityDomainService
    {
        $aiAbilityDomainService = $this->createMock(AiAbilityDomainService::class);
        $expectation = $aiAbilityDomainService->expects($this->exactly($expectedReads))
            ->method('getProviderConfig');
        if ($expectedReads > 0) {
            $expectation->with(
                $this->identicalTo($expectedCode),
            )->willReturn($config);
        }

        return $aiAbilityDomainService;
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
