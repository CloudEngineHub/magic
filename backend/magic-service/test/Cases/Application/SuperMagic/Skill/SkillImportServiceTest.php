<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\SuperMagic\Skill;

use App\Application\SuperMagic\Skill\Import\SkillImportService;
use App\Application\SuperMagic\Skill\Import\SkillPackageParser;
use App\Infrastructure\Util\Locker\LockerInterface;
use Hyperf\Redis\Redis;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use RuntimeException;

/**
 * @internal
 */
class SkillImportServiceTest extends TestCase
{
    public function testGenerateGetAndDeleteUseTheSameKeyPrefix(): void
    {
        $redis = new RecordingSkillImportRedis();

        /** @var SkillPackageParser $packageParser */
        $packageParser = (new ReflectionClass(SkillPackageParser::class))->newInstanceWithoutConstructor();
        $service = new SkillImportService($redis, $packageParser, $this->createMock(LockerInterface::class));
        $token = $service->generate('skill_import_token:', ['package_name' => 'demo-skill']);
        $data = $service->get('skill_import_token:', $token);
        $service->delete('skill_import_token:', $token);

        $this->assertSame('demo-skill', $data['package_name']);
        $this->assertSame(SkillImportService::EXPIRES_IN_SECONDS, $redis->lastTtl);
        $this->assertSame(['skill_import_token:' . $token], $redis->deletedKeys);
    }
}

final class RecordingSkillImportRedis extends Redis
{
    public int $lastTtl = 0;

    /** @var list<string> */
    public array $deletedKeys = [];

    /** @var array<string, string> */
    private array $values = [];

    public function __construct()
    {
    }

    public function __call($name, $arguments)
    {
        $key = (string) ($arguments[0] ?? '');
        if ($name === 'setex') {
            $this->lastTtl = (int) ($arguments[1] ?? 0);
            $this->values[$key] = (string) ($arguments[2] ?? '');
            return true;
        }
        if ($name === 'get') {
            return $this->values[$key] ?? null;
        }
        if ($name === 'del') {
            $this->deletedKeys[] = $key;
            unset($this->values[$key]);
            return 1;
        }

        throw new RuntimeException("Redis command {$name} is not supported in this test");
    }
}
