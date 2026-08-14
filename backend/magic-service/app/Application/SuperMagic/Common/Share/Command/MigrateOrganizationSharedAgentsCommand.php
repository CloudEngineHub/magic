<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Common\Share\Command;

use App\Domain\Permission\Entity\ValueObject\PermissionDataIsolation;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\ResourceType as ResourceVisibilityResourceType;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\VisibilityType;
use App\Domain\Permission\Service\ResourceVisibilityDomainService;
use App\Domain\SuperMagic\Agent\Entity\AgentVersionEntity;
use App\Domain\SuperMagic\Agent\Entity\UserAgentEntity;
use App\Domain\SuperMagic\Agent\Entity\ValueObject\AgentMarketType;
use App\Domain\SuperMagic\Agent\Entity\ValueObject\AgentSourceType;
use App\Domain\SuperMagic\Agent\Entity\ValueObject\PublishStatus;
use App\Domain\SuperMagic\Agent\Entity\ValueObject\PublishTargetType;
use App\Domain\SuperMagic\Agent\Entity\ValueObject\SuperMagicAgentDataIsolation;
use App\Domain\SuperMagic\Agent\Service\SuperMagicAgentMarketDomainService;
use App\Domain\SuperMagic\Agent\Service\SuperMagicAgentVersionDomainService;
use App\Domain\SuperMagic\Agent\Service\UserAgentDomainService;
use Hyperf\Command\Annotation\Command;
use Hyperf\Command\Command as HyperfCommand;
use Hyperf\DbConnection\Db;
use RuntimeException;
use Symfony\Component\Console\Input\InputOption;

/**
 * 一次性历史数据迁移命令。
 *
 * 迁移顺序固定为：market_type 回填 → 组织共享市场 → 市场货架 → 历史 Topic 雇佣
 * → 员工兼容可见性收口。命令只处理数据，不改变版本、员工或 Topic 本体。
 *
 * 执行前必须备份 magic_super_magic_agent_market、magic_resource_visibility 和
 * magic_super_magic_user_agents；完成上线后应删除本命令，避免被当作在线能力复用。
 */
#[Command]
class MigrateOrganizationSharedAgentsCommand extends HyperfCommand
{
    public function __construct(
        private readonly SuperMagicAgentVersionDomainService $versionDomainService,
        private readonly SuperMagicAgentMarketDomainService $marketDomainService,
        private readonly UserAgentDomainService $userAgentDomainService,
        private readonly ResourceVisibilityDomainService $resourceVisibilityDomainService,
    ) {
        parent::__construct('super-magic:migrate-organization-shared-agents');
    }

    public function configure(): void
    {
        parent::configure();
        $this->setDescription('回填市场类型，并迁移组织共享员工的货架和历史 Topic 雇佣关系');
        $this->addOption('agent-code', null, InputOption::VALUE_REQUIRED, '仅回填并迁移指定员工');
        $this->addOption('page', null, InputOption::VALUE_REQUIRED, '组织共享员工页码', '1');
        $this->addOption('page-size', null, InputOption::VALUE_REQUIRED, '组织共享员工单批数量', '100');
        $this->addOption('dry-run', 'd', InputOption::VALUE_NONE, '仅输出影响统计，不写入任何业务数据');
        $this->addOption('force', 'f', InputOption::VALUE_NONE, '重新绑定范围内已有 MARKET 雇佣到当前市场和版本');
    }

    public function handle(): void
    {
        $result = $this->migrate(
            (string) ($this->input->getOption('agent-code') ?? ''),
            (int) $this->input->getOption('page'),
            (int) $this->input->getOption('page-size'),
            (bool) $this->input->getOption('dry-run'),
            (bool) $this->input->getOption('force')
        );
        $this->line(json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    }

    /** @return array<string, mixed> */
    private function migrate(?string $agentCode, int $page, int $pageSize, bool $dryRun, bool $force): array
    {
        $page = max(1, $page);
        $pageSize = min(max(1, $pageSize), 200);
        $agentCode = trim((string) $agentCode);
        $query = Db::table('magic_super_magic_agent_versions')
            ->select(['id', 'code'])
            ->whereIn('publish_target_type', [PublishTargetType::ORGANIZATION->value, PublishTargetType::MEMBER->value])
            ->where('publish_status', PublishStatus::PUBLISHED->value)
            ->where('is_current_version', true)
            ->whereNull('deleted_at')
            ->orderBy('id');
        if ($agentCode !== '') {
            $query->where('code', $agentCode);
        }

        $total = (clone $query)->count();
        $rows = $query->forPage($page, $pageSize)->get();
        $stats = [
            'dry_run' => $dryRun,
            'force' => $force,
            'page' => $page,
            'page_size' => $pageSize,
            'total_candidates' => $total,
            // market_type 与 organization_code 解耦，历史迁移绝不再清空组织编码。
            'market_type_backfill' => $this->backfillMarketTypes($agentCode, $dryRun),
            'processed_versions' => [],
            'market_records' => 0,
            'shelf_records' => 0,
            'topic_hit_users' => [],
            'candidate_topic_hire_users' => [],
            'shelf_eligible_topic_users' => [],
            'collaboration_eligible_topic_users' => [],
            'out_of_scope_topic_users_list' => [],
            'topic_user_discoverability_sources' => [],
            'created_hires' => 0,
            'compensated_hires' => 0,
            'converted_legacy_ownerships' => 0,
            'deleted_legacy_ownerships' => 0,
            'out_of_scope_topic_users' => 0,
            'preserved_creator_ownerships' => 0,
            'skipped_conflicting_ownerships' => 0,
            'skipped_versions' => 0,
        ];

        foreach ($rows as $row) {
            $version = $this->versionDomainService->findByIdWithoutOrganizationFilter((int) $row['id']);
            if ($version === null || ! in_array($version->getPublishTargetType(), [PublishTargetType::ORGANIZATION, PublishTargetType::MEMBER], true)) {
                ++$stats['skipped_versions'];
                continue;
            }

            $result = $dryRun
                ? $this->previewVersion($version)
                : Db::transaction(fn (): array => $this->migrateVersion($version, $force));

            $stats['processed_versions'][] = $result['version'];
            $stats['market_records'] += $result['market_records'];
            $stats['shelf_records'] += $result['shelf_records'];
            $stats['created_hires'] += $result['created_hires'];
            $stats['compensated_hires'] += $result['compensated_hires'];
            $stats['converted_legacy_ownerships'] += $result['converted_legacy_ownerships'];
            $stats['deleted_legacy_ownerships'] += $result['deleted_legacy_ownerships'];
            $stats['out_of_scope_topic_users'] += $result['out_of_scope_topic_users'];
            $stats['preserved_creator_ownerships'] += $result['preserved_creator_ownerships'];
            $stats['skipped_conflicting_ownerships'] += $result['skipped_conflicting_ownerships'];
            $stats['topic_hit_users'] = array_values(array_unique(array_merge($stats['topic_hit_users'], $result['topic_hit_users'])));
            $stats['candidate_topic_hire_users'] = array_values(array_unique(array_merge(
                $stats['candidate_topic_hire_users'],
                $result['candidate_topic_hire_users']
            )));
            $stats['shelf_eligible_topic_users'] = array_values(array_unique(array_merge(
                $stats['shelf_eligible_topic_users'],
                $result['shelf_eligible_topic_users']
            )));
            $stats['collaboration_eligible_topic_users'] = array_values(array_unique(array_merge(
                $stats['collaboration_eligible_topic_users'],
                $result['collaboration_eligible_topic_users']
            )));
            $stats['out_of_scope_topic_users_list'] = array_values(array_unique(array_merge(
                $stats['out_of_scope_topic_users_list'],
                $result['out_of_scope_topic_users_list']
            )));
            $stats['topic_user_discoverability_sources'] = array_replace(
                $stats['topic_user_discoverability_sources'],
                $result['topic_user_discoverability_sources']
            );
        }

        return $stats;
    }

    /**
     * 回填所有未标注市场类型的记录；公开市场保留发布组织，类型才是唯一业务判定。
     *
     * @return array{market:int, organization:int, unresolved:int, updated:int}
     */
    private function backfillMarketTypes(string $agentCode, bool $dryRun): array
    {
        $baseQuery = Db::table('magic_super_magic_agent_market as market')
            ->join('magic_super_magic_agent_versions as version', 'version.id', '=', 'market.agent_version_id')
            ->whereNull('market.deleted_at')
            ->whereNull('version.deleted_at')
            ->where(function ($query) {
                $query->whereNull('market.market_type')->orWhere('market.market_type', '');
            });
        if ($agentCode !== '') {
            $baseQuery->where('market.agent_code', $agentCode);
        }

        $typeTargets = [
            AgentMarketType::MARKET->value => [PublishTargetType::MARKET->value],
            AgentMarketType::ORGANIZATION->value => [PublishTargetType::ORGANIZATION->value, PublishTargetType::MEMBER->value],
        ];
        $stats = ['market' => 0, 'organization' => 0, 'unresolved' => 0, 'updated' => 0];
        foreach ($typeTargets as $marketType => $publishTargetTypes) {
            $count = (clone $baseQuery)->whereIn('version.publish_target_type', $publishTargetTypes)->count();
            $stats[strtolower($marketType)] = $count;
            if (! $dryRun && $count > 0) {
                (clone $baseQuery)
                    ->whereIn('version.publish_target_type', $publishTargetTypes)
                    ->update(['market_type' => $marketType]);
                $stats['updated'] += $count;
            }
        }

        $stats['unresolved'] = (clone $baseQuery)
            ->whereNotIn('version.publish_target_type', array_merge(...array_values($typeTargets)))
            ->count();

        return $stats;
    }

    /** @return array<string, mixed> */
    private function previewVersion(AgentVersionEntity $version): array
    {
        $topicHitUsers = $this->findTopicHitUserIds($version->getOrganizationCode(), $version->getCode());
        $existingOwnerships = $this->userAgentDomainService->findAllUserAgentOwnershipsByCode(
            SuperMagicAgentDataIsolation::create($version->getOrganizationCode(), $version->getCreator()),
            $version->getCode()
        );
        $creatorOwnerships = array_filter(
            $existingOwnerships,
            static fn (UserAgentEntity $ownership): bool => $ownership->getUserId() === $version->getCreator()
        );
        $existingUserIds = array_fill_keys(array_map(
            static fn (UserAgentEntity $ownership): string => $ownership->getUserId(),
            $existingOwnerships
        ), true);
        $candidateTopicHireUsers = [];
        $shelfEligibleTopicUsers = [];
        $collaborationEligibleTopicUsers = [];
        $outOfScopeTopicUsers = [];
        $discoverabilitySources = [];
        $permissionIsolation = PermissionDataIsolation::create($version->getOrganizationCode(), $version->getCreator());
        foreach ($topicHitUsers as $userId) {
            $sources = $this->marketDomainService->getVersionMarketDiscoverabilitySourcesForUser(
                $permissionIsolation,
                $version,
                $userId
            );
            $discoverabilitySources[$userId] = $sources ?: ['out_of_scope'];
            if ($userId === $version->getCreator()) {
                continue;
            }
            if (isset($existingUserIds[$userId])) {
                continue;
            }
            if ($sources === []) {
                $outOfScopeTopicUsers[] = $userId;
                continue;
            }

            $candidateTopicHireUsers[] = $userId;
            if (in_array('shelf', $sources, true)) {
                $shelfEligibleTopicUsers[] = $userId;
            }
            if (in_array('collaborator', $sources, true)) {
                $collaborationEligibleTopicUsers[] = $userId;
            }
        }

        // dry-run 不写货架，成员共享的最终命中情况必须在真实执行时按当前部门成员关系复核。
        return $this->resultForVersion(
            $version,
            $topicHitUsers,
            $candidateTopicHireUsers,
            preservedCreatorOwnerships: count($creatorOwnerships),
            shelfEligibleTopicUsers: $shelfEligibleTopicUsers,
            collaborationEligibleTopicUsers: $collaborationEligibleTopicUsers,
            outOfScopeTopicUsersList: $outOfScopeTopicUsers,
            discoverabilitySources: $discoverabilitySources,
        );
    }

    /** @return array<string, mixed> */
    private function migrateVersion(AgentVersionEntity $version, bool $force): array
    {
        $dataIsolation = SuperMagicAgentDataIsolation::create($version->getOrganizationCode(), $version->getCreator());
        $permissionIsolation = PermissionDataIsolation::create($version->getOrganizationCode(), $version->getCreator());

        // 按 agent_code 覆盖旧公开版本，保证一个员工只保留一个当前市场记录。
        $market = $this->versionDomainService->publishOrganizationSharedMarket($dataIsolation, $version);
        $marketId = (int) $market->getId();
        if ($marketId <= 0) {
            throw new RuntimeException('Organization shared market record was not created');
        }
        $this->saveMarketShelfVisibility($permissionIsolation, $version, $marketId);

        $topicHitUsers = $this->findTopicHitUserIds($version->getOrganizationCode(), $version->getCode());
        $topicHitUserMap = array_fill_keys($topicHitUsers, true);
        $discoverabilitySources = [];
        foreach ($topicHitUsers as $userId) {
            $sources = $this->marketDomainService->getVersionMarketDiscoverabilitySourcesForUser(
                $permissionIsolation,
                $version,
                $userId
            );
            $discoverabilitySources[$userId] = $sources ?: ['out_of_scope'];
        }
        $existingOwnerships = $this->userAgentDomainService->findAllUserAgentOwnershipsByCode($dataIsolation, $version->getCode());
        $processedUserIds = [];
        $stats = [
            'created_hires' => 0,
            'compensated_hires' => 0,
            'converted_legacy_ownerships' => 0,
            'deleted_legacy_ownerships' => 0,
            'out_of_scope_topic_users' => 0,
            'preserved_creator_ownerships' => 0,
            'skipped_conflicting_ownerships' => 0,
        ];

        foreach ($existingOwnerships as $ownership) {
            $userId = $ownership->getUserId();
            $processedUserIds[$userId] = true;
            $isCreator = $userId === $version->getCreator();
            $hasTopicUsage = isset($topicHitUserMap[$userId]);

            // 创建者永远保留本地创建关系，不被 Topic 或共享范围反向撤销。
            if ($isCreator) {
                ++$stats['preserved_creator_ownerships'];
                continue;
            }

            $isMarketDiscoverable = ($discoverabilitySources[$userId] ?? $this->marketDomainService
                ->getVersionMarketDiscoverabilitySourcesForUser($permissionIsolation, $version, $userId)) !== [];

            if ($ownership->getSourceType() === AgentSourceType::LOCAL_CREATE) {
                if ($hasTopicUsage && $isMarketDiscoverable) {
                    $this->saveMarketOwnership($version, $marketId, $userId, $ownership);
                    ++$stats['converted_legacy_ownerships'];
                    continue;
                }

                // 非创建者旧自动关系未形成有效雇佣时必须删除，防止绕过新可用性校验。
                if ($this->deleteOwnership($version, $userId)) {
                    ++$stats['deleted_legacy_ownerships'];
                }
                if ($hasTopicUsage) {
                    ++$stats['out_of_scope_topic_users'];
                }
                continue;
            }

            if ($ownership->getSourceType() === AgentSourceType::MARKET) {
                if ($ownership->getSourceId() !== $marketId) {
                    // 不覆盖另一个市场来源的关系，保留给人工复核或对应市场迁移处理。
                    ++$stats['skipped_conflicting_ownerships'];
                    continue;
                }

                // 已雇佣用户若失去资格，迁移时只撤销当前组织市场来源的关系。
                if (! $isMarketDiscoverable) {
                    if ($this->deleteMarketOwnership($version, $marketId, $userId)) {
                        ++$stats['deleted_legacy_ownerships'];
                    }
                    if ($hasTopicUsage) {
                        ++$stats['out_of_scope_topic_users'];
                    }
                    continue;
                }
                if ($force) {
                    $this->saveMarketOwnership($version, $marketId, $userId, $ownership);
                    ++$stats['compensated_hires'];
                }
                continue;
            }

            // SYSTEM 等非市场来源不在本次规则中转换，输出统计供人工复核。
            ++$stats['skipped_conflicting_ownerships'];
        }

        $candidateTopicHireUsers = [];
        foreach ($topicHitUsers as $userId) {
            if ($userId === $version->getCreator() || isset($processedUserIds[$userId])) {
                continue;
            }
            $candidateTopicHireUsers[] = $userId;
            if (($discoverabilitySources[$userId] ?? []) === []) {
                ++$stats['out_of_scope_topic_users'];
                continue;
            }

            // 历史补雇佣不增加 install_count，避免把兼容修复计入新的市场安装量。
            $this->saveMarketOwnership($version, $marketId, $userId);
            ++$stats['created_hires'];
        }

        // 迁移完成后按同一领域规则收口失效雇佣和员工兼容可见。
        $this->marketDomainService->syncOrganizationMarketHireAccess($permissionIsolation, $market);

        return $this->resultForVersion(
            $version,
            $topicHitUsers,
            $candidateTopicHireUsers,
            $stats['created_hires'],
            $stats['compensated_hires'],
            $stats['converted_legacy_ownerships'],
            $stats['deleted_legacy_ownerships'],
            $stats['out_of_scope_topic_users'],
            $stats['preserved_creator_ownerships'],
            $stats['skipped_conflicting_ownerships'],
            discoverabilitySources: $discoverabilitySources,
        );
    }

    private function saveMarketShelfVisibility(
        PermissionDataIsolation $permissionIsolation,
        AgentVersionEntity $version,
        int $marketId
    ): void {
        if ($version->getPublishTargetType() === PublishTargetType::ORGANIZATION) {
            $this->resourceVisibilityDomainService->saveVisibilityByPrincipals(
                $permissionIsolation,
                ResourceVisibilityResourceType::SUPER_MAGIC_AGENT_MARKET,
                (string) $marketId,
                VisibilityType::ALL
            );
            return;
        }

        $target = $version->getPublishTargetValue();
        $this->resourceVisibilityDomainService->saveVisibilityByPrincipals(
            $permissionIsolation,
            ResourceVisibilityResourceType::SUPER_MAGIC_AGENT_MARKET,
            (string) $marketId,
            VisibilityType::SPECIFIC,
            $target?->getUserIds() ?? [],
            $target?->getDepartmentIds() ?? []
        );
    }

    /**
     * 写入或更新 MARKET 来源关系；特意不调用 hireAgent，避免修改 install_count。
     */
    private function saveMarketOwnership(
        AgentVersionEntity $version,
        int $marketId,
        string $userId,
        ?UserAgentEntity $existingOwnership = null
    ): void {
        $ownership = (new UserAgentEntity())
            ->setOrganizationCode($version->getOrganizationCode())
            ->setUserId($userId)
            ->setAgentCode($version->getCode())
            ->setAgentVersionId($version->getId())
            ->setSourceType(AgentSourceType::MARKET)
            ->setSourceId($marketId);
        if ($existingOwnership?->getId() !== null) {
            $ownership->setId($existingOwnership->getId());
        }

        $this->userAgentDomainService->saveUserAgentOwnership(
            SuperMagicAgentDataIsolation::create($version->getOrganizationCode(), $userId),
            $ownership
        );
    }

    private function deleteOwnership(AgentVersionEntity $version, string $userId): bool
    {
        return $this->userAgentDomainService->deleteUserAgentOwnership(
            SuperMagicAgentDataIsolation::create($version->getOrganizationCode(), $userId),
            $version->getCode()
        );
    }

    private function deleteMarketOwnership(AgentVersionEntity $version, int $marketId, string $userId): bool
    {
        return $this->userAgentDomainService->deleteUserAgentOwnershipsByMarketSourceAndUsers(
            SuperMagicAgentDataIsolation::create($version->getOrganizationCode(), $version->getCreator()),
            $marketId,
            [$userId]
        ) > 0;
    }

    /** @return string[] */
    private function findTopicHitUserIds(string $organizationCode, string $agentCode): array
    {
        return Db::table('magic_super_agent_topics')
            ->where('user_organization_code', $organizationCode)
            ->where('agent_code', $agentCode)
            ->whereNull('deleted_at')
            ->distinct()
            ->pluck('user_id')
            ->map(static fn (mixed $userId): string => (string) $userId)
            ->all();
    }

    /**
     * @param string[] $topicHitUsers
     * @param string[] $candidateTopicHireUsers
     * @return array<string, mixed>
     */
    private function resultForVersion(
        AgentVersionEntity $version,
        array $topicHitUsers,
        array $candidateTopicHireUsers,
        int $createdHires = 0,
        int $compensatedHires = 0,
        int $convertedLegacyOwnerships = 0,
        int $deletedLegacyOwnerships = 0,
        int $outOfScopeTopicUsers = 0,
        int $preservedCreatorOwnerships = 0,
        int $skippedConflictingOwnerships = 0,
        array $shelfEligibleTopicUsers = [],
        array $collaborationEligibleTopicUsers = [],
        array $outOfScopeTopicUsersList = [],
        array $discoverabilitySources = [],
    ): array {
        return [
            'version' => [
                'id' => $version->getId(),
                'agent_code' => $version->getCode(),
                'organization_code' => $version->getOrganizationCode(),
            ],
            'market_records' => 1,
            'shelf_records' => 1,
            'topic_hit_users' => $topicHitUsers,
            'candidate_topic_hire_users' => $candidateTopicHireUsers,
            'shelf_eligible_topic_users' => $shelfEligibleTopicUsers,
            'collaboration_eligible_topic_users' => $collaborationEligibleTopicUsers,
            'out_of_scope_topic_users_list' => $outOfScopeTopicUsersList,
            'topic_user_discoverability_sources' => $discoverabilitySources,
            'created_hires' => $createdHires,
            'compensated_hires' => $compensatedHires,
            'converted_legacy_ownerships' => $convertedLegacyOwnerships,
            'deleted_legacy_ownerships' => $deletedLegacyOwnerships,
            'out_of_scope_topic_users' => $outOfScopeTopicUsers,
            'preserved_creator_ownerships' => $preservedCreatorOwnerships,
            'skipped_conflicting_ownerships' => $skippedConflictingOwnerships,
        ];
    }
}
