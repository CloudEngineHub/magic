<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Application\Agent\Service;

use App\Domain\Permission\Entity\ValueObject\PermissionDataIsolation;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\ResourceType as ResourceVisibilityResourceType;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\VisibilityType;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\Page;
use App\Infrastructure\ExternalAPI\Sms\Enum\LanguageEnum;
use Dtyq\SuperMagic\Application\Agent\Assembler\AdminSuperMagicAgentAssembler;
use Dtyq\SuperMagic\Domain\Agent\Entity\AgentVersionEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\AgentMarketType;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\PublishTargetType;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\Query\AgentVersionAdminQuery;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\ReviewStatus;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\SuperMagicAgentDataIsolation;
use Dtyq\SuperMagic\Domain\Agent\Service\SuperMagicAgentCategoryDomainService;
use Dtyq\SuperMagic\Domain\Agent\Service\SuperMagicAgentMarketDomainService;
use Dtyq\SuperMagic\Domain\Agent\Service\SuperMagicAgentVersionDomainService;
use Dtyq\SuperMagic\ErrorCode\SuperMagicErrorCode;
use Dtyq\SuperMagic\Interfaces\Agent\DTO\Request\QueryAgentMarketsRequestAdminDTO;
use Dtyq\SuperMagic\Interfaces\Agent\DTO\Request\QueryAgentVersionsRequestAdminDTO;
use Dtyq\SuperMagic\Interfaces\Agent\DTO\Request\ReviewAgentVersionRequestDTO;
use Dtyq\SuperMagic\Interfaces\Agent\DTO\Request\ReviewOrganizationAgentVersionRequestDTO;
use Dtyq\SuperMagic\Interfaces\Agent\DTO\Request\UpdateAgentMarketRequestAdminDTO;
use Dtyq\SuperMagic\Interfaces\Agent\DTO\Response\GetEmployeeDetailResponseDTO;
use Dtyq\SuperMagic\Interfaces\Agent\DTO\Response\QueryAgentMarketsResponseAdminDTO;
use Dtyq\SuperMagic\Interfaces\Agent\DTO\Response\QueryAgentVersionsResponseAdminDTO;
use Hyperf\DbConnection\Db;
use Hyperf\Di\Annotation\Inject;
use Qbhy\HyperfAuth\Authenticatable;
use Throwable;

/**
 * 后台管理 Agent 应用服务.
 */
class AdminSuperMagicAgentAppService extends AbstractSuperMagicAppService
{
    #[Inject]
    protected SuperMagicAgentCategoryDomainService $superMagicAgentCategoryDomainService;

    #[Inject]
    protected SuperMagicAgentVersionDomainService $superMagicAgentVersionDomainService;

    #[Inject]
    protected SuperMagicAgentMarketDomainService $superMagicAgentMarketDomainService;

    #[Inject]
    protected AdminSuperMagicAgentAssembler $adminSuperMagicAgentAssembler;

    /**
     * 管理后台：分页查询员工（Agent）版本列表.
     */
    public function queryVersions(
        Authenticatable $authorization,
        QueryAgentVersionsRequestAdminDTO $requestDTO
    ): QueryAgentVersionsResponseAdminDTO {
        $dataIsolation = $this->createSuperMagicDataIsolation($authorization);
        $dataIsolation->disabled();

        $page = new Page($requestDTO->getPage(), $requestDTO->getPageSize());
        $query = $this->buildAgentVersionAdminQuery(
            $requestDTO,
            PublishTargetType::filterValues(PublishTargetType::MARKET->value),
            $requestDTO->getOrganizationCode()
        );
        $result = $this->superMagicAgentVersionDomainService->queryVersions(
            $dataIsolation,
            $query,
            $page
        );
        /** @var AgentVersionEntity[] $versions */
        $versions = $result['list'];
        [$publishTargetUserMap, $memberDepartmentMap] = $this->batchLoadAgentVersionRelatedEntities(null, $versions);

        return $this->adminSuperMagicAgentAssembler->createQueryVersionsResponseDTO(
            $versions,
            $page,
            $result['total'],
            $publishTargetUserMap,
            $memberDepartmentMap
        );
    }

    /**
     * 管理后台：分页查询员工（Agent）市场列表.
     */
    public function queryMarkets(
        Authenticatable $authorization,
        QueryAgentMarketsRequestAdminDTO $requestDTO
    ): QueryAgentMarketsResponseAdminDTO {
        $dataIsolation = $this->createSuperMagicDataIsolation($authorization);
        $dataIsolation->disabled();

        $page = new Page($requestDTO->getPage(), $requestDTO->getPageSize());
        $result = $this->superMagicAgentMarketDomainService->queryAdminMarkets(
            $requestDTO->getPublishStatus(),
            $requestDTO->getOrganizationCode(),
            $requestDTO->getNameI18n(),
            $requestDTO->getPublisherType(),
            $requestDTO->getAgentCode(),
            $requestDTO->getStartTime(),
            $requestDTO->getEndTime(),
            $requestDTO->getCategoryIds(),
            $requestDTO->getOrderBy(),
            $page
        );
        $this->fillMarketCategoryIds($result['list']);

        return $this->adminSuperMagicAgentAssembler->createQueryMarketsResponseDTO(
            $result['list'],
            $page,
            $result['total']
        );
    }

    /**
     * 查询当前组织内待审核/已审核的数字员工版本。
     * 仅包含发布到组织或指定成员范围的版本，不包含市场发布版本。
     */
    public function queryOrganizationVersions(
        Authenticatable $authorization,
        QueryAgentVersionsRequestAdminDTO $requestDTO
    ): QueryAgentVersionsResponseAdminDTO {
        $dataIsolation = $this->createSuperMagicDataIsolation($authorization);
        $page = new Page($requestDTO->getPage(), $requestDTO->getPageSize());
        $publishTargetTypes = PublishTargetType::resolveOrganizationReviewFilterValues($requestDTO->getPublishTargetType());

        if ($publishTargetTypes === []) {
            return $this->adminSuperMagicAgentAssembler->createQueryVersionsResponseDTO([], $page, 0);
        }

        $query = $this->buildAgentVersionAdminQuery(
            $requestDTO,
            $publishTargetTypes,
            $dataIsolation->getCurrentOrganizationCode(),
            [ReviewStatus::INVALIDATED->value]
        );
        $result = $this->superMagicAgentVersionDomainService->queryVersions(
            $dataIsolation,
            $query,
            $page
        );
        /** @var AgentVersionEntity[] $versions */
        $versions = $result['list'];
        [$publishTargetUserMap, $memberDepartmentMap] = $this->batchLoadAgentVersionRelatedEntities(null, $versions);

        return $this->adminSuperMagicAgentAssembler->createQueryVersionsResponseDTO(
            $versions,
            $page,
            $result['total'],
            $publishTargetUserMap,
            $memberDepartmentMap
        );
    }

    /**
     * 组织后台审核数字员工版本，按 action 分发通过或拒绝逻辑。
     */
    public function reviewOrganizationVersion(Authenticatable $authorization, int $id, ReviewOrganizationAgentVersionRequestDTO $requestDTO): void
    {
        if ($requestDTO->isApproved()) {
            $this->approveOrganizationVersion($authorization, $id, $requestDTO->getReviewRemark());
            return;
        }

        $this->rejectOrganizationVersion($authorization, $id, $requestDTO->getReviewRemark());
    }

    /**
     * 组织后台审核通过数字员工版本，并按发布目标同步组织内可见范围。
     */
    public function approveOrganizationVersion(Authenticatable $authorization, int $id, ?string $reviewRemark = null): void
    {
        $dataIsolation = $this->createSuperMagicDataIsolation($authorization);
        $modifier = $dataIsolation->getCurrentUserId();
        $pendingVersion = $this->superMagicAgentVersionDomainService->findByIdWithoutOrganizationFilter($id);

        Db::beginTransaction();
        try {
            $previousVersion = null;
            if ($pendingVersion !== null) {
                $previousVersion = $this->superMagicAgentVersionDomainService->getCurrentVersionByCodeForUpdate(
                    $dataIsolation,
                    $pendingVersion->getCode()
                );
            }

            $versionEntity = $this->superMagicAgentVersionDomainService->reviewOrganizationAgentVersion(
                $dataIsolation,
                $id,
                ReviewStatus::APPROVED,
                $modifier,
                $reviewRemark
            );
            $agentEntity = $this->superMagicAgentDomainService->getByCodeWithException($dataIsolation, $versionEntity->getCode());
            if (in_array($versionEntity->getPublishTargetType(), [PublishTargetType::ORGANIZATION, PublishTargetType::MEMBER], true)) {
                $this->publishOrganizationSharedMarketAndSyncShelf($dataIsolation, $versionEntity);
            } else {
                // 个人发布仍沿用原有发布范围收口逻辑。
                $this->syncAgentPublishScopeTransition(
                    $dataIsolation,
                    $agentEntity,
                    $previousVersion,
                    $versionEntity
                );
            }
            Db::commit();
        } catch (Throwable $throwable) {
            Db::rollBack();
            throw $throwable;
        }
    }

    /**
     * 组织后台审核拒绝数字员工版本，不改变当前生效版本和可见范围。
     */
    public function rejectOrganizationVersion(Authenticatable $authorization, int $id, ?string $reviewRemark = null): void
    {
        $dataIsolation = $this->createSuperMagicDataIsolation($authorization);

        $this->superMagicAgentVersionDomainService->reviewOrganizationAgentVersion(
            $dataIsolation,
            $id,
            ReviewStatus::REJECTED,
            $dataIsolation->getCurrentUserId(),
            $reviewRemark
        );
    }

    /**
     * 更新员工市场排序值.
     */
    public function updateMarketSortOrder(Authenticatable $authorization, int $id, int $sortOrder): void
    {
        $dataIsolation = $this->createSuperMagicDataIsolation($authorization);
        $dataIsolation->disabled();

        if (! $this->superMagicAgentMarketDomainService->updateSortOrderById($id, $sortOrder)) {
            ExceptionBuilder::throw(SuperMagicErrorCode::NotFound, 'common.not_found', ['label' => (string) $id]);
        }
    }

    /**
     * 按传入字段部分更新员工市场信息.
     */
    public function updateMarket(Authenticatable $authorization, int $id, UpdateAgentMarketRequestAdminDTO $requestDTO): void
    {
        $dataIsolation = $this->createSuperMagicDataIsolation($authorization);
        $dataIsolation->disabled();

        if (! $requestDTO->hasUpdates()) {
            return;
        }

        $payload = $requestDTO->getUpdatePayload();
        $categoryIds = $payload['category_ids'] ?? null;
        if ($categoryIds !== null) {
            $this->superMagicAgentCategoryDomainService->assertIdsExist($categoryIds);
            $payload['category_id'] = $categoryIds[0] ?? null;
        }

        Db::transaction(function () use ($dataIsolation, $id, $payload): void {
            if (! $this->updateMarketInfo($dataIsolation, $id, $payload)) {
                ExceptionBuilder::throw(SuperMagicErrorCode::NotFound, 'common.not_found', ['label' => (string) $id]);
            }

            // 下架与货架、雇佣关系撤销必须原子提交，避免隐藏后仍保留可用关系。
            if (($payload['is_hidden'] ?? null) === true) {
                $this->revokeHiddenOrganizationSharedMarket($dataIsolation, $id);
            }
        });
    }

    /**
     * 审核员工版本.
     */
    public function reviewAgentVersion(Authenticatable $authorization, int $id, ReviewAgentVersionRequestDTO $requestDTO): void
    {
        $dataIsolation = $this->createSuperMagicDataIsolation($authorization);
        $dataIsolation->disabled();

        // 获取修改者
        $modifier = $dataIsolation->getCurrentUserId();

        if ($requestDTO->getAction() !== 'APPROVED') {
            $this->superMagicAgentVersionDomainService->reviewAgentVersion(
                $dataIsolation,
                $id,
                $requestDTO->getAction(),
                $modifier,
                $requestDTO->getPublisherType() ?: null,
                reviewRemark: $requestDTO->getReviewRemark()
            );
            return;
        }

        $pendingVersion = $this->superMagicAgentVersionDomainService->findByIdWithoutOrganizationFilter($id);
        Db::beginTransaction();
        try {
            $previousVersion = null;
            if ($pendingVersion !== null) {
                $previousVersion = $this->superMagicAgentVersionDomainService->getCurrentVersionByCodeForUpdate(
                    $dataIsolation,
                    $pendingVersion->getCode()
                );
            }

            $this->superMagicAgentVersionDomainService->reviewAgentVersion(
                $dataIsolation,
                $id,
                $requestDTO->getAction(),
                $modifier,
                $requestDTO->getPublisherType() ?: null,
                reviewRemark: $requestDTO->getReviewRemark()
            );
            $versionEntity = $this->superMagicAgentVersionDomainService->findByIdWithoutOrganizationFilter($id);
            if ($versionEntity === null) {
                ExceptionBuilder::throw(SuperMagicErrorCode::AgentVersionNotFound, 'super_magic.agent.agent_version_not_found');
            }
            $agentEntity = $this->superMagicAgentDomainService->getByCodeWithException($dataIsolation, $versionEntity->getCode());
            // 市场审核通过后，统一按前后发布目标切换权限。
            $this->syncAgentPublishScopeTransition(
                $dataIsolation,
                $agentEntity,
                $previousVersion,
                $versionEntity
            );
            Db::commit();
        } catch (Throwable $throwable) {
            Db::rollBack();
            throw $throwable;
        }
    }

    /**
     * 根据员工code查询员工详情.
     */
    public function getDetailByCode(Authenticatable $authorization, string $code): GetEmployeeDetailResponseDTO
    {
        $dataIsolation = $this->createSuperMagicDataIsolation($authorization);

        // 1. 查询 Agent 基本信息（不存在会抛出异常）
        $agent = $this->superMagicAgentDomainService->getByCodeWithException($dataIsolation, $code);

        // 2. 更新 Agent 图标 URL（将路径转换为完整URL）
        $this->updateAgentEntityIcon($agent);

        // 3. 处理 prompt
        $prompt = $agent->getPrompt();

        // 4. 兼容旧数据
        $nameI18n = $agent->getNameI18n();
        $descriptionI18n = $agent->getDescriptionI18n();
        if (! $nameI18n) {
            foreach (LanguageEnum::getAllLanguageCodes() as $languageCode) {
                $nameI18n[$languageCode] = $agent->getName();
            }
        }
        if (! $descriptionI18n) {
            foreach (LanguageEnum::getAllLanguageCodes() as $languageCode) {
                $descriptionI18n[$languageCode] = $agent->getDescription();
            }
        }

        // 5. 构建响应 DTO
        return new GetEmployeeDetailResponseDTO(
            id: $agent->getId(),
            code: $agent->getCode(),
            versionCode: $agent->getVersionCode(),
            versionId: $agent->getVersionId() ? (string) $agent->getVersionId() : null,
            name: $agent->getI18nName($dataIsolation->getLanguage()),
            description: $agent->getI18nDescription($dataIsolation->getLanguage()),
            nameI18n: $nameI18n,
            roleI18n: $descriptionI18n,
            descriptionI18n: $agent->getDescriptionI18n(),
            icon: $agent->getIcon(),
            iconType: $agent->getIconType(),
            prompt: $prompt,
            enabled: $agent->getEnabled() ?? false,
            sourceType: $agent->getSourceType()->value,
            pinnedAt: $agent->getPinnedAt(),
            projectId: $agent->getProjectId(),
            createdAt: $agent->getCreatedAt(),
            updatedAt: $agent->getUpdatedAt()
        );
    }

    public function updateMarketCategory(Authenticatable $authorization, int $id, array $categoryIds): void
    {
        $this->superMagicAgentCategoryDomainService->assertIdsExist($categoryIds);
        $dataIsolation = $this->createSuperMagicDataIsolation($authorization);
        $dataIsolation->disabled();
        if (! $this->updateMarketInfo($dataIsolation, $id, [
            'category_id' => $categoryIds[0] ?? null,
            'category_ids' => $categoryIds,
        ])) {
            ExceptionBuilder::throw(SuperMagicErrorCode::NotFound, 'common.not_found', ['label' => (string) $id]);
        }
    }

    private function publishOrganizationSharedMarketAndSyncShelf(
        SuperMagicAgentDataIsolation $dataIsolation,
        AgentVersionEntity $versionEntity
    ): void {
        $marketEntity = $this->superMagicAgentVersionDomainService->publishOrganizationSharedMarket($dataIsolation, $versionEntity);
        $marketId = (int) $marketEntity->getId();
        if ($marketId <= 0) {
            ExceptionBuilder::throw(SuperMagicErrorCode::OperationFailed, 'super_magic.operation_failed');
        }
        $permissionIsolation = PermissionDataIsolation::create(
            $dataIsolation->getCurrentOrganizationCode(),
            $dataIsolation->getCurrentUserId()
        );

        if ($versionEntity->getPublishTargetType() === PublishTargetType::ORGANIZATION) {
            $this->resourceVisibilityDomainService->saveVisibilityByPrincipals(
                $permissionIsolation,
                ResourceVisibilityResourceType::SUPER_MAGIC_AGENT_MARKET,
                (string) $marketId,
                VisibilityType::ALL
            );
        } else {
            $target = $versionEntity->getPublishTargetValue();
            $this->resourceVisibilityDomainService->saveVisibilityByPrincipals(
                $permissionIsolation,
                ResourceVisibilityResourceType::SUPER_MAGIC_AGENT_MARKET,
                (string) $marketId,
                VisibilityType::SPECIFIC,
                $target?->getUserIds() ?? [],
                $target?->getDepartmentIds() ?? []
            );
        }

        // 货架更新后由市场领域服务收口失去发现资格的 MARKET 雇佣。
        $this->marketEligibilityDomainService->syncOrganizationMarketHireAccess(
            $permissionIsolation,
            $marketEntity
        );
    }

    private function revokeHiddenOrganizationSharedMarket(
        SuperMagicAgentDataIsolation $dataIsolation,
        int $marketId
    ): void {
        $market = $this->superMagicAgentMarketDomainService->getById($marketId);
        if ($market === null || $market->getOrganizationCode() === null || $market->getOrganizationCode() === '') {
            return;
        }
        if ($market->getMarketType() !== AgentMarketType::ORGANIZATION) {
            return;
        }

        $permissionIsolation = PermissionDataIsolation::create(
            $market->getOrganizationCode(),
            $dataIsolation->getCurrentUserId()
        );
        $this->resourceVisibilityDomainService->saveVisibilityByPrincipals(
            $permissionIsolation,
            ResourceVisibilityResourceType::SUPER_MAGIC_AGENT_MARKET,
            (string) $marketId,
            VisibilityType::NONE
        );

        $revokedUserIds = [];
        foreach ($this->userAgentDomainService->findUserAgentOwnershipsByMarketSource($dataIsolation, $marketId) as $ownership) {
            if ($ownership->getUserId() !== $market->getPublisherId()) {
                $revokedUserIds[] = $ownership->getUserId();
            }
        }
        if ($revokedUserIds !== []) {
            $this->userAgentDomainService->deleteUserAgentOwnershipsByMarketSourceAndUsers(
                $dataIsolation,
                $marketId,
                array_values(array_unique($revokedUserIds))
            );
        }

        $this->saveAgentVisibility(
            $permissionIsolation,
            $market->getAgentCode(),
            VisibilityType::SPECIFIC,
            [$market->getPublisherId()]
        );
    }

    /**
     * 将接口请求参数转换为领域查询条件。
     *
     * @param null|array<int, string> $publishTargetTypes
     * @param null|array<int, string> $excludeReviewStatuses
     */
    private function buildAgentVersionAdminQuery(
        QueryAgentVersionsRequestAdminDTO $requestDTO,
        ?array $publishTargetTypes,
        ?string $organizationCode,
        ?array $excludeReviewStatuses = null
    ): AgentVersionAdminQuery {
        $query = new AgentVersionAdminQuery();
        $query->setReviewStatus($requestDTO->getReviewStatus());
        $query->setPublishStatus($requestDTO->getPublishStatus());
        $query->setPublishTargetTypes($publishTargetTypes);
        $query->setVersion($requestDTO->getVersion());
        $query->setOrganizationCode($organizationCode);
        $query->setNameI18n($requestDTO->getNameI18n());
        $query->setStartTime($requestDTO->getStartTime());
        $query->setEndTime($requestDTO->getEndTime());
        $query->setOrderBy($requestDTO->getOrderBy());
        $query->setExcludeReviewStatuses($excludeReviewStatuses);

        return $query;
    }
}
