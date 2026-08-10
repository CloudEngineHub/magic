<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Domain\MagicBase\Service;

use App\Domain\MagicBase\Repository\Facade\MagicBaseMetadataCleanupRepositoryInterface;
use App\Domain\MagicBase\Repository\Facade\MagicBaseRowCleanupRepositoryInterface;
use App\Domain\MagicBase\Service\MagicBaseProjectCleanupDomainService;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
final class MagicBaseProjectCleanupDomainServiceTest extends TestCase
{
    public function testDeletesRowsBeforeMetadata(): void
    {
        $calls = [];
        $rowCleanupRepository = $this->createMock(MagicBaseRowCleanupRepositoryInterface::class);
        $rowCleanupRepository->expects(self::once())
            ->method('deleteProjectRows')
            ->with('ORG001', 123)
            ->willReturnCallback(static function () use (&$calls): void {
                $calls[] = 'rows';
            });

        $metadataCleanupRepository = $this->createMock(MagicBaseMetadataCleanupRepositoryInterface::class);
        $metadataCleanupRepository->expects(self::once())
            ->method('deleteProjectMetadata')
            ->with('ORG001', 123)
            ->willReturnCallback(static function () use (&$calls): void {
                $calls[] = 'metadata';
            });

        $service = new MagicBaseProjectCleanupDomainService($rowCleanupRepository, $metadataCleanupRepository);
        $service->deleteProjectData('ORG001', 123);

        self::assertSame(['rows', 'metadata'], $calls);
    }
}
