<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Application\SuperAgent\Service;

use Dtyq\SuperMagic\Domain\Share\Entity\ResourceShareEntity;
use Dtyq\SuperMagic\Domain\Share\Service\ResourceShareDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\MicroAppEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\MicroAppPublishStatus;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\MicroAppRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\ProjectRepositoryInterface;

class PublishedMicroAppResolver
{
    public function __construct(
        private readonly MicroAppRepositoryInterface $microAppRepository,
        private readonly ProjectRepositoryInterface $projectRepository,
        private readonly ResourceShareDomainService $resourceShareDomainService,
    ) {
    }

    /**
     * @return null|array{0: MicroAppEntity, 1: ResourceShareEntity}
     */
    public function findPublished(int $appId): ?array
    {
        $record = $this->microAppRepository->findById($appId);
        if ($record === null || $record->getPublishStatus() !== MicroAppPublishStatus::Published->value) {
            return null;
        }

        $shareEntity = $this->resourceShareDomainService->getValidShareByResourceId($record->getResourceId());
        if ($shareEntity === null) {
            return null;
        }

        return [$record, $shareEntity];
    }

    public function getProjectName(int $appId): string
    {
        $publishedMicroApp = $this->findPublished($appId);
        if ($publishedMicroApp === null) {
            return '';
        }

        [$record] = $publishedMicroApp;
        $project = $this->projectRepository->findById($record->getProjectId());
        if ($project === null || $project->getDeletedAt() !== null) {
            return '';
        }

        return trim($project->getProjectName());
    }
}
