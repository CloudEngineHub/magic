<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\Util\Concurrency;

use App\Infrastructure\Util\Concurrency\ConcurrencyLease;
use App\Infrastructure\Util\Concurrency\RedisConcurrencyLimiter;
use Hyperf\Redis\Redis;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
final class RedisConcurrencyLimiterTest extends TestCase
{
    public function testTryAcquireStoresResourceInPoolWithLeaseToken(): void
    {
        $redis = new RecordingRedisForConcurrency();
        $limiter = new RedisConcurrencyLimiter($redis);

        $lease = $limiter->tryAcquire('test:operation:running', 'task-1', 1, 30);

        $this->assertTrue($lease->canProceed());
        $this->assertTrue($lease->ownsSlot());
        $this->assertSame(1, $redis->evalCalls);
        $this->assertStringContainsString('zremrangebyscore', $redis->evalScript);
        $this->assertStringContainsString('hset', $redis->evalScript);
        $this->assertStringContainsString('zcard', $redis->evalScript);
        $this->assertSame(2, $redis->evalKeyCount);
        $this->assertSame('test:operation:running', $redis->evalArguments[0]);
        $this->assertSame('test:operation:running:tokens', $redis->evalArguments[1]);
        $this->assertSame('task-1', $redis->evalArguments[2]);
        $this->assertStringStartsWith('task-1:', $redis->evalArguments[3]);
        $this->assertSame('1', $redis->evalArguments[4]);
        $this->assertSame('30', $redis->evalArguments[5]);
        $this->assertIsNumeric($redis->evalArguments[6]);
        $this->assertSame($redis->evalArguments[3], $lease->getToken());
    }

    public function testTryAcquireSkipsRedisWhenLimitDisabled(): void
    {
        $redis = new RecordingRedisForConcurrency();
        $limiter = new RedisConcurrencyLimiter($redis);

        $lease = $limiter->tryAcquire('test:operation:running', 'task-1', 0, 30);

        $this->assertTrue($lease->canProceed());
        $this->assertFalse($lease->ownsSlot());
        $this->assertSame(0, $redis->evalCalls);
    }

    public function testTryAcquireDoesNotProceedWhenResourceAlreadyHasLease(): void
    {
        $redis = new RecordingRedisForConcurrency();
        $redis->evalResult = [2, ''];
        $limiter = new RedisConcurrencyLimiter($redis);

        $lease = $limiter->tryAcquire('test:operation:running', 'task-1', 1, 30);

        $this->assertFalse($lease->canProceed());
        $this->assertFalse($lease->ownsSlot());
    }

    public function testReleaseOnlyDeletesMatchingLeaseToken(): void
    {
        $redis = new RecordingRedisForConcurrency();
        $redis->evalResult = 1;
        $limiter = new RedisConcurrencyLimiter($redis);
        $lease = ConcurrencyLease::acquired('task-1', 'lease-token');

        $this->assertTrue($limiter->release($lease, 'test:operation:running'));

        $this->assertSame(1, $redis->evalCalls);
        $this->assertStringContainsString('hget', $redis->evalScript);
        $this->assertStringContainsString('zrem', $redis->evalScript);
        $this->assertSame(2, $redis->evalKeyCount);
        $this->assertSame('test:operation:running', $redis->evalArguments[0]);
        $this->assertSame('test:operation:running:tokens', $redis->evalArguments[1]);
        $this->assertSame('task-1', $redis->evalArguments[2]);
        $this->assertSame('lease-token', $redis->evalArguments[3]);
    }
}

final class RecordingRedisForConcurrency extends Redis
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
