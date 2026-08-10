<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Common\RecycleBin\Handler;

use App\Domain\MagicBase\Service\MagicBaseProjectCleanupDomainService;
use App\Domain\SuperMagic\Common\RecycleBin\Entity\RecycleBinEntity;
use App\Domain\SuperMagic\Common\RecycleBin\Enum\RecycleBinResourceType;
use App\Domain\SuperMagic\Common\RecycleBin\Repository\Facade\RecycleBinRepositoryInterface;
use App\Domain\SuperMagic\Common\Share\Repository\Facade\ResourceShareRepositoryInterface;
use App\Domain\SuperMagic\Project\Repository\Facade\MicroAppRepositoryInterface;
use Hyperf\DbConnection\Db;
use RuntimeException;
use Throwable;

class MicroAppPermanentDeleteHandler implements PermanentDeleteHandlerInterface
{
    public function __construct(
        private readonly MagicBaseProjectCleanupDomainService $magicBaseProjectCleanupDomainService,
        private readonly MicroAppRepositoryInterface $microAppRepository,
        private readonly ResourceShareRepositoryInterface $resourceShareRepository,
        private readonly RecycleBinRepositoryInterface $recycleBinRepository,
    ) {
    }

    public function supports(RecycleBinResourceType $type): bool
    {
        return $type === RecycleBinResourceType::MicroApp;
    }

    public function handleBatch(array $recycleBinEntities): array
    {
        $failed = [];

        foreach ($recycleBinEntities as $entity) {
            try {
                $this->handle($entity);
            } catch (Throwable) {
                $failed[] = [
                    'id' => (string) $entity->getId(),
                    'resource_type' => $entity->getResourceType()->value,
                    'resource_id' => (string) $entity->getResourceId(),
                    'resource_name' => $entity->getResourceName(),
                ];
            }
        }

        return ['failed' => $failed];
    }

    private function handle(RecycleBinEntity $entity): void
    {
        $appId = $entity->getResourceId();
        $microApp = $this->microAppRepository->findByIdWithTrashed($appId);
        $snapshot = (array) (($entity->getExtraData() ?? [])['micro_app'] ?? []);
        $projectId = $microApp?->getProjectId() ?? (int) ($snapshot['project_id'] ?? 0);
        $organizationCode = $microApp?->getOrganizationCode() ?? (string) ($snapshot['organization_code'] ?? '');
        $resourceId = $microApp?->getResourceId() ?? (string) ($snapshot['resource_id'] ?? '');

        if ($projectId <= 0 || $organizationCode === '') {
            throw new RuntimeException(sprintf('Invalid micro app cleanup context for app %d', $appId));
        }

        // MongoDB is intentionally cleaned first. Both cleanup steps are idempotent,
        // so a later failure leaves the recycle-bin record available for retry.
        $this->magicBaseProjectCleanupDomainService->deleteProjectData($organizationCode, $projectId);

        Db::transaction(function () use ($appId, $resourceId, $entity): void {
            $share = $resourceId === '' ? null : $this->resourceShareRepository->getShareByResourceIdWithTrashed($resourceId);
            if ($share !== null && ! $this->resourceShareRepository->delete($share->getId(), true)) {
                throw new RuntimeException(sprintf('Failed to permanently delete micro app share %d', $share->getId()));
            }

            if (! $this->microAppRepository->forceDeleteById($appId)) {
                throw new RuntimeException(sprintf('Failed to permanently delete micro app %d', $appId));
            }

            if ($entity->getId() !== null && ! $this->recycleBinRepository->deleteById($entity->getId())) {
                throw new RuntimeException(sprintf('Failed to delete recycle bin record %d', $entity->getId()));
            }
        });
    }
}
