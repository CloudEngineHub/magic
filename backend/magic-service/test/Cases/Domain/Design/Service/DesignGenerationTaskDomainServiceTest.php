<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Domain\Design\Service;

use App\Domain\Design\Entity\DesignDataIsolation;
use App\Domain\Design\Entity\DesignGenerationTaskEntity;
use App\Domain\Design\Entity\ValueObject\DesignGenerationStatus;
use App\Domain\Design\Repository\Facade\DesignGenerationTaskRepositoryInterface;
use App\Domain\Design\Service\DesignGenerationTaskDomainService;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

/**
 * @internal
 */
class DesignGenerationTaskDomainServiceTest extends TestCase
{
    public function testSanitizePublicErrorCodeReturnsNullWhenTranslationIsNestedArray(): void
    {
        $service = new DesignGenerationTaskDomainService($this->createMock(DesignGenerationTaskRepositoryInterface::class));
        $method = new ReflectionMethod(DesignGenerationTaskDomainService::class, 'sanitizePublicErrorCode');
        $method->setAccessible(true);

        $this->assertNull($method->invoke($service, 'InvalidParameter'));
    }

    public function testMarkAsFailedWithNestedErrorCodeTranslationUpdatesStatus(): void
    {
        $entity = new DesignGenerationTaskEntity();
        $entity->setGenerationId('video-1');
        $entity->setStatus(DesignGenerationStatus::PROCESSING);

        $repository = $this->createMock(DesignGenerationTaskRepositoryInterface::class);
        $repository->expects($this->once())
            ->method('update')
            ->with(
                $this->isInstanceOf(DesignDataIsolation::class),
                $this->callback(static function (DesignGenerationTaskEntity $task): bool {
                    return $task->getStatus() === DesignGenerationStatus::FAILED
                        && $task->getErrorMessage() !== null
                        && $task->getErrorMessage() !== '';
                }),
            );

        $service = new DesignGenerationTaskDomainService($repository);
        $service->markAsFailed(
            new DesignDataIsolation(),
            $entity,
            'image data 0 failed: Image dimensions are too small.',
            'InvalidParameter',
        );
    }
}
