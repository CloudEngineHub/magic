<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Domain\Mode\Service;

use App\Domain\Mode\Entity\ModeDataIsolation;
use App\Domain\Mode\Entity\ModeEntity;
use App\Domain\Mode\Repository\Facade\ModeGroupRelationRepositoryInterface;
use App\Domain\Mode\Repository\Facade\ModeGroupRepositoryInterface;
use App\Domain\Mode\Repository\Facade\ModeRepositoryInterface;
use App\Domain\Mode\Service\ModeDomainService;
use Mockery;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class ModeSystemDefaultAgentTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
    }

    public function testReturnsConfiguredSystemDefaultAgentCode(): void
    {
        $repository = Mockery::mock(ModeRepositoryInterface::class);
        $mode = $this->createMode('ppt');
        $repository->shouldReceive('findSystemDefaultAgent')->once()->andReturn($mode);

        $service = $this->createService($repository);

        self::assertSame('ppt', $service->getSystemDefaultAgent(new ModeDataIsolation('official')));
    }

    public function testFallsBackToGeneralWhenSystemDefaultAgentIsNotConfigured(): void
    {
        $repository = Mockery::mock(ModeRepositoryInterface::class);
        $repository->shouldReceive('findSystemDefaultAgent')->once()->andReturnNull();

        $service = $this->createService($repository);

        self::assertSame('general', $service->getSystemDefaultAgent(new ModeDataIsolation('official')));
    }

    public function testUpdatesSystemDefaultAgentThroughRepository(): void
    {
        $repository = Mockery::mock(ModeRepositoryInterface::class);
        $repository->shouldReceive('setSystemDefaultAgent')->once()->with(
            Mockery::type(ModeDataIsolation::class),
            123
        );

        $service = $this->createService($repository);
        $mode = $this->createMode('ppt');
        $mode->setId(123);
        $service->setSystemDefaultAgent(new ModeDataIsolation('official'), $mode);

        self::assertTrue(true);
    }

    private function createService(ModeRepositoryInterface $repository): ModeDomainService
    {
        return new ModeDomainService(
            $repository,
            Mockery::mock(ModeGroupRepositoryInterface::class),
            Mockery::mock(ModeGroupRelationRepositoryInterface::class),
        );
    }

    private function createMode(string $identifier): ModeEntity
    {
        $mode = new ModeEntity();
        $mode->setIdentifier($identifier);
        $mode->setStatus(true);
        return $mode;
    }
}
