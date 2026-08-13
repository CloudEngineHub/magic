<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Application\SlidesTemplate;

use App\Application\SlidesTemplate\Service\SlidesTemplateProjectExportService;
use App\Domain\File\Repository\Persistence\Facade\CloudFileRepositoryInterface;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Infrastructure\Core\ValueObject\StorageBucketType;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use ReflectionClass;

/**
 * @internal
 */
class SlidesTemplateProjectExportServiceTest extends TestCase
{
    public function testCleanupExportedFilesDeletesPrivateAndPublicDirectories(): void
    {
        $repository = $this->createMock(CloudFileRepositoryInterface::class);
        $repository->expects($this->exactly(2))
            ->method('listObjectsByCredential')
            ->willReturnCallback(function (string $organizationCode, string $prefix, StorageBucketType $bucket): array {
                $this->assertSame('ORG-1', $organizationCode);
                $this->assertSame('slide-templates/template-code/0123456789abcdef01234567', $prefix);
                return [
                    'objects' => [[
                        'key' => 'ORG-1/open/' . $prefix . '/' . $bucket->value . '.dat',
                    ]],
                    'next_marker' => null,
                ];
            });
        $repository->expects($this->exactly(2))
            ->method('deleteObjectsByCredential')
            ->with(
                'slide-templates/template-code/0123456789abcdef01234567',
                'ORG-1',
                $this->callback(static fn (array $keys): bool => count($keys) === 1),
                $this->isInstanceOf(StorageBucketType::class),
                ['internal_endpoint' => true],
            );

        $this->makeService($repository)->cleanupExportedFiles(
            $this->makeDataIsolation(),
            ['code' => 'template-code'],
            '0123456789abcdef01234567',
        );
    }

    public function testCleanupPreviousTemplateDirectoryUsesPreviousRandomDirectory(): void
    {
        $repository = $this->createMock(CloudFileRepositoryInterface::class);
        $repository->expects($this->exactly(2))
            ->method('listObjectsByCredential')
            ->with(
                'ORG-1',
                'slide-templates/template-code/aaaaaaaaaaaaaaaaaaaaaaaa',
                $this->isInstanceOf(StorageBucketType::class),
                ['max-keys' => 1000],
            )
            ->willReturn(['objects' => [], 'next_marker' => null]);
        $repository->expects($this->never())->method('deleteObjectsByCredential');

        $template = (new SlidesTemplateEntity())
            ->setCode('template-code')
            ->setTemplateFileKey('ORG-1/open/slide-templates/template-code/aaaaaaaaaaaaaaaaaaaaaaaa/template.zip');

        $this->makeService($repository)->cleanupPreviousTemplateDirectory(
            $this->makeDataIsolation(),
            $template,
            'bbbbbbbbbbbbbbbbbbbbbbbb',
        );
    }

    private function makeService(CloudFileRepositoryInterface $repository): SlidesTemplateProjectExportService
    {
        $reflection = new ReflectionClass(SlidesTemplateProjectExportService::class);
        /** @var SlidesTemplateProjectExportService $service */
        $service = $reflection->newInstanceWithoutConstructor();
        $reflection->getProperty('cloudFileRepository')->setValue($service, $repository);
        $reflection->getProperty('logger')->setValue($service, new NullLogger());
        return $service;
    }

    private function makeDataIsolation(): SlidesTemplateDataIsolation
    {
        $reflection = new ReflectionClass(SlidesTemplateDataIsolation::class);
        /** @var SlidesTemplateDataIsolation $dataIsolation */
        $dataIsolation = $reflection->newInstanceWithoutConstructor();
        $dataIsolation->setCurrentOrganizationCode('ORG-1');
        $dataIsolation->setCurrentUserId('user-1');
        $dataIsolation->setEnabled(true);
        return $dataIsolation;
    }
}
