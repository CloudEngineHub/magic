<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Project\Service;

use App\Application\SuperMagic\Common\Service\AbstractAppService;
use App\Application\SuperMagic\Common\Share\Service\ResourceShareAppService;
use App\Application\SuperMagic\Project\DTO\Request\MicroAppListRequestDTO;
use App\Application\SuperMagic\Project\DTO\Request\PublishedMicroAppListRequestDTO;
use App\Application\SuperMagic\Project\DTO\Request\PublishMicroAppRequestDTO;
use App\Application\SuperMagic\Project\DTO\Request\UpdateMicroAppRequestDTO;
use App\Domain\Contact\Service\MagicDepartmentUserDomainService;
use App\Domain\Provider\Service\ModelFilter\PackageFilterInterface;
use App\Domain\SuperMagic\Common\Share\Constant\ResourceType;
use App\Domain\SuperMagic\Common\Share\Constant\ShareAccessType;
use App\Domain\SuperMagic\Common\Share\Entity\ResourceShareEntity;
use App\Domain\SuperMagic\Common\Share\Service\ResourceShareDomainService;
use App\Domain\SuperMagic\Project\Entity\MicroAppEntity;
use App\Domain\SuperMagic\Project\Entity\ProjectEntity;
use App\Domain\SuperMagic\Project\Entity\ValueObject\MicroAppPublishStatus;
use App\Domain\SuperMagic\Project\Entity\ValueObject\ProjectMode;
use App\Domain\SuperMagic\Project\Event\ProjectUpdatedEvent;
use App\Domain\SuperMagic\Project\Repository\Facade\MicroAppRepositoryInterface;
use App\Domain\SuperMagic\Project\Repository\Facade\ProjectRepositoryInterface;
use App\Domain\SuperMagic\Project\Service\ProjectDomainService;
use App\Domain\SuperMagic\Project\Service\ProjectMemberDomainService;
use App\Domain\SuperMagic\Workspace\Entity\ValueObject\WorkspaceType;
use App\Domain\SuperMagic\Workspace\Repository\Facade\WorkspaceRepositoryInterface;
use App\ErrorCode\GenericErrorCode;
use App\ErrorCode\SuperAgentErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\SuperMagic\Utils\ShareUrlBuilder;
use App\Infrastructure\Util\Context\RequestContext;
use App\Interfaces\SuperMagic\Common\Share\DTO\Request\CreateShareRequestDTO;
use Hyperf\DbConnection\Db;
use Psr\EventDispatcher\EventDispatcherInterface;
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
        private readonly ProjectDomainService $projectDomainService,
        private readonly ProjectAppService $projectAppService,
        private readonly ProjectMemberDomainService $projectMemberDomainService,
        private readonly MagicDepartmentUserDomainService $departmentUserDomainService,
        private readonly PackageFilterInterface $packageFilterService,
        private readonly EventDispatcherInterface $eventDispatcher,
        private readonly PublishedMicroAppResolver $publishedMicroAppResolver,
        private readonly MicroAppProjectResponseFormatter $responseFormatter,
        private readonly MicroAppShareConfig $shareConfig,
    ) {
    }

    public function publish(RequestContext $requestContext, int $appId, PublishMicroAppRequestDTO $requestDTO): array
    {
        $authorization = $requestContext->getUserAuthorization();
        [$record, $project] = $this->getValidatedMicroApp($appId);
        $projectId = $project->getId();
        $this->getAccessibleProjectWithManager(
            $projectId,
            $authorization->getId(),
            $authorization->getOrganizationCode()
        );
        $projectNameChanged = $project->getProjectName() !== $requestDTO->getProjectName();
        $coverFileKey = $requestDTO->hasCoverFileKey() ? $requestDTO->getCoverFileKey() : $record->getCoverFileKey();
        $coverChanged = $record->getCoverFileKey() !== $coverFileKey;

        if ($record->getOrganizationCode() !== $project->getUserOrganizationCode()) {
            ExceptionBuilder::throw(SuperAgentErrorCode::PROJECT_ACCESS_DENIED, 'project.access_denied');
        }

        $now = date('Y-m-d H:i:s');

        Db::beginTransaction();
        try {
            if ($projectNameChanged || $coverChanged) {
                $project
                    ->setProjectName($requestDTO->getProjectName())
                    ->setUpdatedUid($authorization->getId())
                    ->setUpdatedAt($now);
                $project = $this->projectDomainService->saveProjectEntity($project);
            }

            $shareData = [
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
                'show_share_url' => true,
            ];
            if ($requestDTO->hasExtra()) {
                $existingShare = $this->resourceShareDomainService->getShareByResourceIdWithTrashed($record->getResourceId());
                $shareData['extra'] = $this->shareConfig->buildExtra($existingShare?->getExtra(), $requestDTO);
            }
            $shareDTO = CreateShareRequestDTO::fromArray($shareData);
            $shareItem = $this->resourceShareAppService->createShare($authorization, $shareDTO);
            $accessUrl = $this->shareUrlBuilder->buildMicroAppShareUrl((string) $record->getId());

            $record
                ->setShareId($shareItem->id)
                ->setShareCode($shareItem->shareCode)
                ->setShareType($requestDTO->getShareType())
                ->setShareRange($requestDTO->getShareType() === ShareAccessType::TeamShare->value ? $requestDTO->getShareRange() : null)
                ->setTargetIds($requestDTO->getShareType() === ShareAccessType::TeamShare->value && $requestDTO->getShareRange() === 'designated' ? $requestDTO->getTargetIds() : [])
                ->setPublishStatus(MicroAppPublishStatus::Published->value)
                ->setAccessUrl($accessUrl)
                ->setCoverFileKey($coverFileKey)
                ->setPublishedAt($now)
                ->setUnpublishedAt(null);

            $record = $this->microAppRepository->save($record);
            Db::commit();
        } catch (Throwable $e) {
            Db::rollBack();
            throw $e;
        }

        if ($projectNameChanged || $coverChanged) {
            $this->eventDispatcher->dispatch(new ProjectUpdatedEvent($project, $authorization));
        }

        return $this->responseFormatter->formatPublishRecord(
            $record,
            $project->getProjectName(),
            $shareItem->extra,
        );
    }

    public function delete(RequestContext $requestContext, int $appId): array
    {
        [, $project] = $this->getValidatedMicroApp($appId);

        $this->projectAppService->deleteProject($requestContext, $project->getId());

        return [
            'app_id' => (string) $appId,
            'project_id' => (string) $project->getId(),
            'deleted' => true,
        ];
    }

    public function update(RequestContext $requestContext, int $appId, UpdateMicroAppRequestDTO $requestDTO): array
    {
        if (! $requestDTO->hasUpdates()) {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'app_name or cover_file_key is required');
        }

        $authorization = $requestContext->getUserAuthorization();
        [$record, $project] = $this->getValidatedMicroApp($appId);
        $this->getAccessibleProjectWithEditor(
            $project->getId(),
            $authorization->getId(),
            $authorization->getOrganizationCode()
        );

        if ($record->getOrganizationCode() !== $project->getUserOrganizationCode()) {
            ExceptionBuilder::throw(SuperAgentErrorCode::PROJECT_ACCESS_DENIED, 'project.access_denied');
        }

        $projectName = $requestDTO->hasAppName() ? $requestDTO->getAppName() : $project->getProjectName();
        $projectNameChanged = $project->getProjectName() !== $projectName;
        $coverFileKey = $requestDTO->hasCoverFileKey() ? $requestDTO->getCoverFileKey() : $record->getCoverFileKey();
        $coverChanged = $record->getCoverFileKey() !== $coverFileKey;
        if (! $projectNameChanged && ! $coverChanged) {
            return $this->responseFormatter->formatAppMetadata($record, $project);
        }

        $now = date('Y-m-d H:i:s');
        Db::beginTransaction();
        try {
            $project
                ->setProjectName($projectName ?? '')
                ->setUpdatedUid($authorization->getId())
                ->setUpdatedAt($now);
            $project = $this->projectDomainService->saveProjectEntity($project);

            if ($coverChanged) {
                $record->setCoverFileKey($coverFileKey);
                $record = $this->microAppRepository->save($record);
            }
            Db::commit();
        } catch (Throwable $e) {
            Db::rollBack();
            throw $e;
        }

        $this->eventDispatcher->dispatch(new ProjectUpdatedEvent($project, $authorization));

        return $this->responseFormatter->formatAppMetadata($record, $project);
    }

    public function unpublish(RequestContext $requestContext, int $appId): array
    {
        $authorization = $requestContext->getUserAuthorization();
        [$record, $project] = $this->getValidatedMicroApp($appId);
        $this->getAccessibleProjectWithManager(
            $project->getId(),
            $authorization->getId(),
            $authorization->getOrganizationCode()
        );

        if ($record->getOrganizationCode() !== $project->getUserOrganizationCode()) {
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

        return $this->responseFormatter->formatPublishRecord($record, $project->getProjectName());
    }

    public function show(RequestContext $requestContext, int $appId): array
    {
        $authorization = $requestContext->getUserAuthorization();
        [$record, $project] = $this->getValidatedMicroApp($appId);
        $this->getAccessibleProject(
            $project->getId(),
            $authorization->getId(),
            $authorization->getOrganizationCode()
        );

        return $this->responseFormatter->formatMicroApp($record, $project);
    }

    public function showByProject(RequestContext $requestContext, int $projectId): array
    {
        $authorization = $requestContext->getUserAuthorization();
        $project = $this->projectRepository->findById($projectId);
        if ($project === null || ! $this->isMicroAppProject($project)) {
            ExceptionBuilder::throw(SuperAgentErrorCode::PROJECT_NOT_FOUND, 'project.project_not_found');
        }

        $this->getAccessibleProject(
            $projectId,
            $authorization->getId(),
            $authorization->getOrganizationCode()
        );

        $record = $this->microAppRepository->ensureByProjectId(
            $projectId,
            $project->getUserOrganizationCode(),
            $project->getUserId(),
            $project->getCreatedUid(),
        );

        return $this->responseFormatter->formatMicroApp($record, $project);
    }

    public function resolvePublished(int $appId): array
    {
        $publishedMicroApp = $this->publishedMicroAppResolver->findPublished($appId);
        if ($publishedMicroApp === null) {
            ExceptionBuilder::throw(SuperAgentErrorCode::PROJECT_NOT_FOUND, 'micro_app.publish_not_found');
        }

        return $this->responseFormatter->formatPublishedResolution(...$publishedMicroApp);
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
                'project' => $this->responseFormatter->formatProject($project),
                'publish' => $this->responseFormatter->formatPublishRecord(
                    $record,
                    $project->getProjectName(),
                    $shareEntity->getExtra(),
                ),
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

    public function list(RequestContext $requestContext, MicroAppListRequestDTO $requestDTO): array
    {
        $authorization = $requestContext->getUserAuthorization();
        $dataIsolation = $this->createDataIsolation($authorization);
        $userId = $authorization->getId();

        $departmentIds = $this->departmentUserDomainService->getDepartmentIdsByUserId(
            $dataIsolation,
            $userId,
            true
        );
        $organizationCodes = $this->getAccessibleOrganizationCodes(
            $userId,
            $departmentIds,
            $authorization->getOrganizationCode()
        );

        $result = $this->microAppRepository->paginateAccessible(
            $userId,
            array_map('strval', $departmentIds),
            $organizationCodes,
            $requestDTO->getScope(),
            $requestDTO->getKeyword(),
            $requestDTO->getPage(),
            $requestDTO->getPageSize()
        );

        $coverUrls = $this->responseFormatter->resolveCoverUrls($result['list']);
        $items = [];
        foreach ($result['list'] as $row) {
            $appId = (string) ($row['app_id'] ?? '');
            $coverKey = (string) ($row['cover_file_key'] ?? '');
            $items[] = [
                'app_id' => $appId,
                'app_name' => (string) ($row['app_name'] ?? ''),
                'app_description' => (string) ($row['app_description'] ?? ''),
                'creator_id' => (string) ($row['creator_id'] ?? ''),
                'cover_url' => $coverUrls[$this->responseFormatter->coverUrlMapKey($row, $coverKey)] ?? '',
                'publish_status' => (string) ($row['publish_status'] ?? MicroAppPublishStatus::Unpublished->value),
                'updated_at' => ($row['updated_at'] ?? null) !== null ? (string) $row['updated_at'] : null,
                'can_delete' => (string) ($row['project_owner_id'] ?? '') === $userId,
            ];
        }

        return [
            'list' => $items,
            'total' => (int) $result['total'],
            'page' => $requestDTO->getPage(),
            'page_size' => $requestDTO->getPageSize(),
        ];
    }

    /**
     * @return array{0: MicroAppEntity, 1: ProjectEntity}
     */
    private function getValidatedMicroApp(int $appId): array
    {
        $record = $this->microAppRepository->findById($appId);
        if ($record === null) {
            ExceptionBuilder::throw(SuperAgentErrorCode::PROJECT_NOT_FOUND, 'project.project_not_found');
        }

        $project = $this->projectRepository->findById($record->getProjectId());
        if ($project === null) {
            ExceptionBuilder::throw(SuperAgentErrorCode::PROJECT_NOT_FOUND, 'project.project_not_found');
        }

        if (! $this->isMicroAppProject($project)) {
            ExceptionBuilder::throw(SuperAgentErrorCode::VALIDATE_FAILED, 'micro_app.invalid_project_type');
        }

        return [$record, $project];
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
                $shareEntity->getShareCode()
            );
            return true;
        } catch (Throwable) {
            return false;
        }
    }

    private function containsKeyword(string $haystack, string $needle): bool
    {
        if (function_exists('mb_stripos')) {
            return mb_stripos($haystack, $needle) !== false;
        }

        return stripos($haystack, $needle) !== false;
    }

    /**
     * @param string[] $departmentIds
     * @return string[]
     */
    private function getAccessibleOrganizationCodes(string $userId, array $departmentIds, string $currentOrganizationCode): array
    {
        $targetIds = array_values(array_unique(array_merge([$userId], $departmentIds)));
        $projectIds = $this->projectMemberDomainService->getProjectIdsByCollaboratorTargets($targetIds);
        $organizationCodes = $this->projectDomainService->getOrganizationCodesByProjectIds($projectIds);
        $paidOrganizationCodes = $this->packageFilterService->filterPaidOrganizations($organizationCodes);

        return array_values(array_unique(array_merge($paidOrganizationCodes, [$currentOrganizationCode])));
    }
}
