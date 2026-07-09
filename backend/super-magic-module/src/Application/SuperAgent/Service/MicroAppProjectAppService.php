<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Application\SuperAgent\Service;

use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Util\Context\RequestContext;
use App\Infrastructure\Util\IdGenerator\IdGenerator;
use Dtyq\SuperMagic\Application\Share\Service\ResourceShareAppService;
use Dtyq\SuperMagic\Application\SuperAgent\DTO\Request\PublishedMicroAppListRequestDTO;
use Dtyq\SuperMagic\Application\SuperAgent\DTO\Request\PublishMicroAppRequestDTO;
use Dtyq\SuperMagic\Domain\Share\Constant\ResourceType;
use Dtyq\SuperMagic\Domain\Share\Constant\ShareAccessType;
use Dtyq\SuperMagic\Domain\Share\Entity\ResourceShareEntity;
use Dtyq\SuperMagic\Domain\Share\Service\ResourceShareDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\MicroAppEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ProjectEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\MicroAppPublishStatus;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\ProjectMode;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\WorkspaceType;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\MicroAppRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\ProjectRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\WorkspaceRepositoryInterface;
use Dtyq\SuperMagic\ErrorCode\SuperAgentErrorCode;
use Dtyq\SuperMagic\Infrastructure\Utils\ShareUrlBuilder;
use Dtyq\SuperMagic\Interfaces\Share\DTO\Request\CreateShareRequestDTO;
use Hyperf\DbConnection\Db;
use Throwable;

class MicroAppProjectAppService extends AbstractAppService
{
    public function __construct(
        private readonly MicroAppRepositoryInterface $microAppRepository,
        private readonly ProjectRepositoryInterface $projectRepository,
        private readonly WorkspaceRepositoryInterface $workspaceRepository,
        private readonly ResourceShareAppService $resourceShareAppService,
        private readonly ResourceShareDomainService $resourceShareDomainService,
        private readonly ShareUrlBuilder $shareUrlBuilder,
    ) {
    }

    public function publish(RequestContext $requestContext, int $projectId, PublishMicroAppRequestDTO $requestDTO): array
    {
        $authorization = $requestContext->getUserAuthorization();
        $project = $this->getValidatedMicroAppProject($projectId, $authorization->getOrganizationCode());

        $record = $this->microAppRepository->findByProjectId($projectId);
        if ($record !== null && $record->getOrganizationCode() !== $authorization->getOrganizationCode()) {
            ExceptionBuilder::throw(SuperAgentErrorCode::PROJECT_ACCESS_DENIED, 'project.access_denied');
        }

        $now = date('Y-m-d H:i:s');
        if ($record === null) {
            $record = (new MicroAppEntity())
                ->setProjectId($projectId)
                ->setResourceId((string) IdGenerator::getSnowId())
                ->setOrganizationCode($authorization->getOrganizationCode())
                ->setUserId($authorization->getId());
        }

        $shareDTO = CreateShareRequestDTO::fromArray([
            'resource_id' => $record->getResourceId(),
            'resource_type' => ResourceType::Project->value,
            'resource_name' => $project->getProjectName(),
            'project_id' => (string) $projectId,
            'share_type' => $requestDTO->getShareType(),
            'share_range' => $requestDTO->getShareType() === ShareAccessType::TeamShare->value ? $requestDTO->getShareRange() : null,
            'target_ids' => $requestDTO->getShareType() === ShareAccessType::TeamShare->value && $requestDTO->getShareRange() === 'designated'
                ? $requestDTO->getTargetIds()
                : [],
            'password' => $requestDTO->getShareType() === ShareAccessType::PasswordProtected->value ? $requestDTO->getPassword() : null,
            'share_project' => true,
            'expire_days' => null,
            'extra' => [],
            'show_share_url' => true,
        ]);

        Db::beginTransaction();
        try {
            $shareItem = $this->resourceShareAppService->createShare($authorization, $shareDTO);
            $accessUrl = $this->shareUrlBuilder->buildMicroAppShareUrl($record->getResourceId());

            $record
                ->setShareId($shareItem->id)
                ->setShareCode($shareItem->shareCode)
                ->setShareType($requestDTO->getShareType())
                ->setShareRange($requestDTO->getShareType() === ShareAccessType::TeamShare->value ? $requestDTO->getShareRange() : null)
                ->setTargetIds($requestDTO->getShareType() === ShareAccessType::TeamShare->value && $requestDTO->getShareRange() === 'designated' ? $requestDTO->getTargetIds() : [])
                ->setPublishStatus(MicroAppPublishStatus::Published->value)
                ->setAccessUrl($accessUrl)
                ->setPublishedAt($now)
                ->setUnpublishedAt(null);

            $record = $this->microAppRepository->save($record);
            Db::commit();
        } catch (Throwable $e) {
            Db::rollBack();
            throw $e;
        }

        return $this->formatPublishRecord($record);
    }

    public function unpublish(RequestContext $requestContext, int $projectId): array
    {
        $authorization = $requestContext->getUserAuthorization();
        $this->getValidatedMicroAppProject($projectId, $authorization->getOrganizationCode());

        $record = $this->microAppRepository->findByProjectId($projectId);
        if ($record === null || $record->getOrganizationCode() !== $authorization->getOrganizationCode()) {
            ExceptionBuilder::throw(SuperAgentErrorCode::PROJECT_NOT_FOUND, 'micro_app.publish_not_found');
        }

        Db::beginTransaction();
        try {
            if ($record->getPublishStatus() === MicroAppPublishStatus::Published->value) {
                $this->resourceShareAppService->cancelShareByResourceId($authorization, $record->getResourceId());
            }

            $record
                ->setPublishStatus(MicroAppPublishStatus::Unpublished->value)
                ->setUnpublishedAt(date('Y-m-d H:i:s'));

            $record = $this->microAppRepository->save($record);
            Db::commit();
        } catch (Throwable $e) {
            Db::rollBack();
            throw $e;
        }

        return $this->formatPublishRecord($record);
    }

    public function publishedList(RequestContext $requestContext, PublishedMicroAppListRequestDTO $requestDTO): array
    {
        $authorization = $requestContext->getUserAuthorization();
        $records = $this->microAppRepository->findPublishedByOrganization($authorization->getOrganizationCode());

        $projectIds = array_values(array_unique(array_map(
            static fn (MicroAppEntity $record): int => $record->getProjectId(),
            $records
        )));
        $projects = [];
        foreach ($this->projectRepository->findByIds($projectIds) as $project) {
            $projects[$project->getId()] = $project;
        }

        $items = [];
        $keyword = $requestDTO->getKeyword();
        foreach ($records as $record) {
            $project = $projects[$record->getProjectId()] ?? null;
            if ($project === null || ! $this->isMicroAppProject($project)) {
                continue;
            }
            if ($keyword !== '' && ! $this->containsKeyword($project->getProjectName(), $keyword)) {
                continue;
            }

            $shareEntity = $this->resourceShareDomainService->getValidShareByResourceId($record->getResourceId());
            if ($shareEntity === null) {
                continue;
            }
            if (! $this->canAccessShare($shareEntity, $authorization->getId(), $authorization->getOrganizationCode())) {
                continue;
            }

            $items[] = [
                'project' => $this->formatProject($project),
                'publish' => $this->formatPublishRecord($record),
            ];
        }

        $total = count($items);
        $page = $requestDTO->getPage();
        $pageSize = $requestDTO->getPageSize();

        return [
            'list' => array_slice($items, ($page - 1) * $pageSize, $pageSize),
            'total' => $total,
            'page' => $page,
            'page_size' => $pageSize,
        ];
    }

    private function getValidatedMicroAppProject(int $projectId, string $organizationCode): ProjectEntity
    {
        $project = $this->projectRepository->findById($projectId);
        if ($project === null || $project->getUserOrganizationCode() !== $organizationCode) {
            ExceptionBuilder::throw(SuperAgentErrorCode::PROJECT_NOT_FOUND, 'project.project_not_found');
        }

        if (! $this->isMicroAppProject($project)) {
            ExceptionBuilder::throw(SuperAgentErrorCode::VALIDATE_FAILED, 'micro_app.invalid_project_type');
        }

        return $project;
    }

    private function isMicroAppProject(ProjectEntity $project): bool
    {
        if ($project->getProjectMode() === ProjectMode::MICRO_APP->value) {
            return true;
        }

        $workspaceId = $project->getWorkspaceId();
        if ($workspaceId === null) {
            return false;
        }

        $workspace = $this->workspaceRepository->getWorkspaceById($workspaceId);
        return $workspace !== null && $workspace->getWorkspaceType() === WorkspaceType::MicroApp->value;
    }

    private function canAccessShare(ResourceShareEntity $shareEntity, string $userId, string $organizationCode): bool
    {
        try {
            $this->resourceShareDomainService->validateShareAccess(
                $shareEntity,
                $userId,
                $organizationCode,
                $shareEntity->getShareCode(),
                true
            );
            return true;
        } catch (Throwable) {
            return false;
        }
    }

    private function formatPublishRecord(MicroAppEntity $record): array
    {
        return [
            'project_id' => $record->getProjectId(),
            'resource_id' => $record->getResourceId(),
            'share_id' => $record->getShareId(),
            'share_code' => $record->getShareCode(),
            'share_type' => $record->getShareType(),
            'share_range' => $record->getShareRange(),
            'target_ids' => $record->getTargetIds(),
            'publish_status' => $record->getPublishStatus(),
            'access_url' => $this->shareUrlBuilder->buildMicroAppShareUrl($record->getResourceId()) ?? $record->getAccessUrl(),
            'published_at' => $record->getPublishedAt(),
            'unpublished_at' => $record->getUnpublishedAt(),
        ];
    }

    private function formatProject(ProjectEntity $project): array
    {
        return [
            'id' => $project->getId(),
            'workspace_id' => $project->getWorkspaceId(),
            'project_name' => $project->getProjectName(),
            'project_description' => $project->getProjectDescription(),
            'project_mode' => $project->getProjectMode(),
            'current_topic_id' => $project->getCurrentTopicId(),
            'current_topic_status' => $project->getCurrentTopicStatus(),
            'created_at' => $project->getCreatedAt(),
            'updated_at' => $project->getUpdatedAt(),
        ];
    }

    private function containsKeyword(string $haystack, string $needle): bool
    {
        if (function_exists('mb_stripos')) {
            return mb_stripos($haystack, $needle) !== false;
        }

        return stripos($haystack, $needle) !== false;
    }
}
