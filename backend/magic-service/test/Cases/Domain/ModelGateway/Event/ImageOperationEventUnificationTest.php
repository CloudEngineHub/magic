<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Domain\ModelGateway\Event;

use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
final class ImageOperationEventUnificationTest extends TestCase
{
    public function testRemoveBackgroundUsesUnifiedImageOperationEventOnly(): void
    {
        $basePath = dirname(__DIR__, 5);
        $legacyEventPath = $basePath . '/app/Domain/ModelGateway/Event/ImageRemoveBackgroundCompletedEvent.php';
        $servicePath = $basePath . '/app/Application/ModelGateway/Service/ImageRemoveBackgroundAppService.php';

        $this->assertFileDoesNotExist($legacyEventPath);
        $serviceCode = (string) file_get_contents($servicePath);

        $this->assertStringNotContainsString('ImageRemoveBackgroundCompletedEvent', $serviceCode);
        $this->assertStringNotContainsString('dispatchCompletedEvent', $serviceCode);
        $this->assertStringContainsString('ImageOperationCompletedEvent::OPERATION_REMOVE_BACKGROUND', $serviceCode);
    }
}
