<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Application\SuperAgent\Service;

use App\Domain\Contact\Service\MagicDepartmentUserDomainService;
use App\Domain\File\Service\FileDomainService;
use App\Domain\Provider\Service\ModelFilter\PackageFilterInterface;
use App\ErrorCode\GenericErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Util\Context\RequestContext;
use Dtyq\SuperMagic\Application\Share\Service\ResourceShareAppService;
use Dtyq\SuperMagic\Application\SuperAgent\DTO\Request\MicroAppListRequestDTO;
use Dtyq\SuperMagic\Application\SuperAgent\DTO\Request\PublishedMicroAppListRequestDTO;
use Dtyq\SuperMagic\Application\SuperAgent\DTO\Request\PublishMicroAppRequestDTO;
use Dtyq\SuperMagic\Application\SuperAgent\DTO\Request\UpdateMicroAppRequestDTO;
use Dtyq\SuperMagic\Domain\Share\Constant\ResourceType;
use Dtyq\SuperMagic\Domain\Share\Constant\ShareAccessType;
use Dtyq\SuperMagic\Domain\Share\Entity\ResourceShareEntity;
use Dtyq\SuperMagic\Domain\Share\Service\ResourceShareDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\MicroAppEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ProjectEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\MicroAppPublishStatus;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\ProjectMode;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\WorkspaceType;
use Dtyq\SuperMagic\Domain\SuperAgent\Event\ProjectUpdatedEvent;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\MicroAppRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\ProjectRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\WorkspaceRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\ProjectDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\ProjectMemberDomainService;
use Dtyq\SuperMagic\ErrorCode\SuperAgentErrorCode;
use Dtyq\SuperMagic\Infrastructure\Utils\ShareUrlBuilder;
use Dtyq\SuperMagic\Interfaces\Share\DTO\Request\CreateShareRequestDTO;
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
        private readonly ProjectMemberDomainService $projectMemberDomainService,
        private readonly MagicDepartmentUserDomainService $departmentUserDomainService,
        private readonly PackageFilterInterface $packageFilterService,
        private readonly FileDomainService $fileDomainService,
        private readonly EventDispatcherInterface $eventDispatcher,
        private readonly PublishedMicroAppResolver $publishedMicroAppResolver,
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

        return $this->formatPublishRecord($record, $project->getProjectName());
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
            return $this->formatAppMetadata($record, $project);
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

        return $this->formatAppMetadata($record, $project);
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

        return $this->formatPublishRecord($record, $project->getProjectName());
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

        return $this->formatMicroApp($record, $project);
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

        return $this->formatMicroApp($record, $project);
    }

    public function resolvePublished(int $appId): array
    {
        $publishedMicroApp = $this->publishedMicroAppResolver->findPublished($appId);
        if ($publishedMicroApp === null) {
            ExceptionBuilder::throw(SuperAgentErrorCode::PROJECT_NOT_FOUND, 'micro_app.publish_not_found');
        }

        [$record, $shareEntity] = $publishedMicroApp;

        $coverKey = trim((string) ($record->getCoverFileKey() ?? ''));
        $coverRow = [
            'organization_code' => $record->getOrganizationCode(),
            'cover_file_key' => $coverKey,
        ];
        $coverUrls = $this->resolveCoverUrls([$coverRow]);

        return [
            'app_id' => (string) $record->getId(),
            'resource_id' => $record->getResourceId(),
            'share_code' => $shareEntity->getShareCode(),
            'cover_url' => $coverUrls[$this->coverUrlMapKey($coverRow, $coverKey)] ?? '',
        ];
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
                'publish' => $this->formatPublishRecord($record, $project->getProjectName()),
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

        $coverUrls = $this->resolveCoverUrls($result['list']);
        $items = [];
        foreach ($result['list'] as $row) {
            $appId = (string) ($row['app_id'] ?? '');
            $coverKey = (string) ($row['cover_file_key'] ?? '');
            $items[] = [
                'app_id' => $appId,
                'app_name' => (string) ($row['app_name'] ?? ''),
                'app_description' => (string) ($row['app_description'] ?? ''),
                'creator_id' => (string) ($row['creator_id'] ?? ''),
                'cover_url' => $coverUrls[$this->coverUrlMapKey($row, $coverKey)] ?? '',
                'publish_status' => (string) ($row['publish_status'] ?? MicroAppPublishStatus::Unpublished->value),
                'updated_at' => ($row['updated_at'] ?? null) !== null ? (string) $row['updated_at'] : null,
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

    private function formatPublishRecord(MicroAppEntity $record, ?string $projectName = null): array
    {
        return [
            'app_id' => (string) $record->getId(),
            'project_id' => $record->getProjectId(),
            'app_name' => $projectName,
            'resource_id' => $record->getResourceId(),
            'share_id' => $record->getShareId(),
            'share_code' => $record->getShareCode(),
            'share_type' => $record->getShareType(),
            'share_range' => $record->getShareRange(),
            'target_ids' => $record->getTargetIds(),
            'cover_file_key' => $record->getCoverFileKey(),
            'publish_status' => $record->getPublishStatus(),
            'access_url' => $this->shareUrlBuilder->buildMicroAppShareUrl((string) $record->getId()) ?? $record->getAccessUrl(),
            'published_at' => $record->getPublishedAt(),
            'unpublished_at' => $record->getUnpublishedAt(),
        ];
    }

    private function formatMicroApp(MicroAppEntity $record, ProjectEntity $project): array
    {
        return [
            'app_id' => (string) $record->getId(),
            'project_id' => (string) $record->getProjectId(),
            'project' => $this->formatProject($project),
            'publish' => $this->formatPublishRecord($record, $project->getProjectName()),
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

    private function formatAppMetadata(MicroAppEntity $record, ProjectEntity $project): array
    {
        $coverKey = $record->getCoverFileKey() ?? '';
        $row = [
            'organization_code' => $project->getUserOrganizationCode(),
            'cover_file_key' => $coverKey,
        ];
        $coverUrls = $this->resolveCoverUrls([$row]);

        return [
            'app_id' => (string) $record->getId(),
            'app_name' => $project->getProjectName(),
            'cover_file_key' => $record->getCoverFileKey(),
            'cover_url' => $coverUrls[$this->coverUrlMapKey($row, $coverKey)] ?? '',
            'publish_status' => $record->getPublishStatus(),
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

    /**
     * @param array<int,array<string,mixed>> $rows
     * @return array<string,string>
     */
    private function resolveCoverUrls(array $rows): array
    {
        $result = [];
        $grouped = [];
        foreach ($rows as $row) {
            $coverKey = trim((string) ($row['cover_file_key'] ?? ''));
            if ($coverKey === '') {
                continue;
            }

            $organizationCode = (string) ($row['organization_code'] ?? '');
            if ($organizationCode === '') {
                continue;
            }

            $mapKey = $this->coverUrlMapKey($row, $coverKey);
            if (filter_var($coverKey, FILTER_VALIDATE_URL)) {
                $result[$mapKey] = $coverKey;
                continue;
            }

            $grouped[$organizationCode][$coverKey] = $mapKey;
        }

        foreach ($grouped as $organizationCode => $coverKeys) {
            try {
                $links = $this->fileDomainService->getLinks($organizationCode, array_keys($coverKeys));
                foreach ($links as $fileKey => $link) {
                    $mapKey = $coverKeys[$fileKey] ?? null;
                    if ($mapKey !== null) {
                        $result[$mapKey] = $link->getUrl();
                    }
                }
            } catch (Throwable) {
                // A missing cover must not make the complete micro-app list fail.
            }
        }

        return $result;
    }

    /**
     * @param array<string,mixed> $row
     */
    private function coverUrlMapKey(array $row, string $coverKey): string
    {
        return (string) ($row['organization_code'] ?? '') . ':' . $coverKey;
    }
}
