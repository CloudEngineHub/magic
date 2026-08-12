<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Application\SuperAgent\Service;

use App\Domain\File\Service\FileDomainService;
use App\Infrastructure\Core\ValueObject\StorageBucketType;
use Dtyq\SuperMagic\Domain\Share\Entity\ResourceShareEntity;
use Dtyq\SuperMagic\Domain\Share\Service\ResourceShareDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\MicroAppEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\MicroAppPublishStatus;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\MicroAppRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\ProjectRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\TaskFileRepositoryInterface;
use Throwable;

class PublishedMicroAppResolver
{
    private const INSTALL_ICON_FILE = 'icon.svg';

    public function __construct(
        private readonly MicroAppRepositoryInterface $microAppRepository,
        private readonly ProjectRepositoryInterface $projectRepository,
        private readonly ResourceShareDomainService $resourceShareDomainService,
        private readonly TaskFileRepositoryInterface $taskFileRepository,
        private readonly FileDomainService $fileDomainService,
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

    /** Resolve the install icon link from the generated file beside app.json. */
    public function getInstallIconUrl(MicroAppEntity $record): string
    {
        $appConfig = $this->taskFileRepository->getByProjectIdAndFileName(
            $record->getProjectId(),
            'app.json'
        );
        if ($appConfig === null) {
            return '';
        }

        $iconFile = $this->taskFileRepository->getByProjectParentAndName(
            $record->getProjectId(),
            $appConfig->getParentId(),
            self::INSTALL_ICON_FILE
        );
        if ($iconFile === null || $iconFile->getFileKey() === '') {
            return '';
        }

        try {
            $links = $this->fileDomainService->getLinks(
                $record->getOrganizationCode(),
                [$iconFile->getFileKey()],
                StorageBucketType::SandBox
            );
        } catch (Throwable) {
            return '';
        }

        return $links[$iconFile->getFileKey()]?->getUrl() ?? '';
    }
}
