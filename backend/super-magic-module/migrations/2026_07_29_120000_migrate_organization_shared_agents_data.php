<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Migration;

use App\Domain\Permission\Entity\ValueObject\PermissionDataIsolation;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\ResourceType as VisibilityResourceType;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\VisibilityType;
use App\Domain\Permission\Service\ResourceVisibilityDomainService;
use Dtyq\SuperMagic\Domain\Agent\Entity\AgentVersionEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\UserAgentEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\AgentMarketType;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\AgentSourceType;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\PublishStatus;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\PublishTargetType;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\SuperMagicAgentDataIsolation;
use Dtyq\SuperMagic\Domain\Agent\Service\SuperMagicAgentMarketDomainService;
use Dtyq\SuperMagic\Domain\Agent\Service\SuperMagicAgentVersionDomainService;
use Dtyq\SuperMagic\Domain\Agent\Service\UserAgentDomainService;
use Hyperf\Context\ApplicationContext;
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Schema;
use Hyperf\DbConnection\Db;
use RuntimeException;
use Throwable;

return new class extends Migration {
    private const LOCK_NAME = 'super_magic:migrate_organization_shared_agents_data';

    private const BATCH_SIZE = 100;

    public function up(): void
    {
        $this->assertSchemaReady();
        $lockAcquired = false;

        try {
            $lockAcquired = $this->acquireLock();
            if (! $lockAcquired) {
                throw new RuntimeException('Unable to acquire organization shared agent migration lock');
            }

            $this->assertDataReady();
            $services = $this->resolveServices();
            $marketTypeStats = $this->backfillMarketTypes();
            $stats = $this->newStats($marketTypeStats);
            $lastVersionId = 0;
            $batch = 0;

            while (true) {
                $rows = $this->candidateQuery()
                    ->where('id', '>', $lastVersionId)
                    ->limit(self::BATCH_SIZE)
                    ->get();
                if ($rows->isEmpty()) {
                    break;
                }

                ++$batch;
                foreach ($rows as $row) {
                    $lastVersionId = (int) $row['id'];
                    $version = $services['version']->findByIdWithoutOrganizationFilter($lastVersionId);
                    if ($version === null || ! in_array($version->getPublishTargetType(), [PublishTargetType::ORGANIZATION, PublishTargetType::MEMBER], true)) {
                        ++$stats['skipped_versions'];
                        continue;
                    }

                    try {
                        $result = Db::transaction(fn (): array => $this->migrateVersion($version, $services));
                    } catch (Throwable $throwable) {
                        throw new RuntimeException(sprintf(
                            'Failed to migrate agent_code=%s version_id=%s organization_code=%s: %s',
                            $version->getCode(),
                            (string) $version->getId(),
                            $version->getOrganizationCode(),
                            $throwable->getMessage()
                        ), 0, $throwable);
                    }
                    $stats = $this->mergeStats($stats, $result);
                }

                $this->output(sprintf(
                    'organization shared agents migration batch=%d last_version_id=%d processed=%d',
                    $batch,
                    $lastVersionId,
                    $stats['processed_versions']
                ));
            }

            $this->output('organization shared agents migration completed ' . json_encode($stats, JSON_UNESCAPED_UNICODE));
        } finally {
            if ($lockAcquired) {
                Db::select('SELECT RELEASE_LOCK(?) AS released', [self::LOCK_NAME]);
            }
        }
    }

    public function down(): void
    {
        // 数据迁移不自动回滚，需使用执行前的业务表备份恢复。
    }

    /** @return array{version:SuperMagicAgentVersionDomainService,market:SuperMagicAgentMarketDomainService,user_agent:UserAgentDomainService,visibility:ResourceVisibilityDomainService} */
    private function resolveServices(): array
    {
        $container = ApplicationContext::getContainer();

        return [
            'version' => $container->get(SuperMagicAgentVersionDomainService::class),
            'market' => $container->get(SuperMagicAgentMarketDomainService::class),
            'user_agent' => $container->get(UserAgentDomainService::class),
            'visibility' => $container->get(ResourceVisibilityDomainService::class),
        ];
    }

    private function acquireLock(): bool
    {
        $result = Db::selectOne('SELECT GET_LOCK(?, 0) AS acquired', [self::LOCK_NAME]);
        $acquired = is_array($result) ? ($result['acquired'] ?? 0) : ($result->acquired ?? 0);
        return (int) $acquired === 1;
    }

    private function assertSchemaReady(): void
    {
        $requiredColumns = [
            'magic_super_magic_agent_market' => ['id', 'agent_code', 'agent_version_id', 'organization_code', 'market_type', 'publish_status', 'deleted_at'],
            'magic_resource_visibility' => ['id', 'resource_type', 'resource_code', 'principal_type', 'principal_id'],
            'magic_super_magic_user_agents' => ['id', 'organization_code', 'user_id', 'agent_code', 'agent_version_id', 'source_type', 'source_id', 'deleted_at'],
            'magic_super_magic_agent_versions' => ['id', 'code', 'organization_code', 'creator', 'publish_target_type', 'publish_target_value', 'publish_status', 'is_current_version', 'deleted_at'],
            'magic_super_agent_topics' => ['user_organization_code', 'user_id', 'agent_code', 'deleted_at'],
            'magic_operation_permissions' => ['organization_code'],
            'magic_contact_department_users' => ['organization_code'],
            'magic_contact_departments' => ['organization_code'],
            'magic_chat_group_users' => ['organization_code'],
        ];

        foreach ($requiredColumns as $table => $columns) {
            if (! Schema::hasTable($table)) {
                throw new RuntimeException("Required migration table is missing: {$table}");
            }
            foreach ($columns as $column) {
                if (! Schema::hasColumn($table, $column)) {
                    throw new RuntimeException("Required migration column is missing: {$table}.{$column}");
                }
            }
        }

        $requiredIndexes = [
            'magic_super_magic_agent_market' => ['idx_org_agent_market_lookup'],
            'magic_super_magic_user_agents' => ['idx_org_source_user'],
        ];
        foreach ($requiredIndexes as $table => $indexes) {
            foreach ($indexes as $index) {
                if (! Schema::hasIndex($table, $index)) {
                    throw new RuntimeException("Required migration index is missing: {$table}.{$index}");
                }
            }
        }
    }

    private function assertDataReady(): void
    {
        $duplicateMarket = Db::table('magic_super_magic_agent_market')
            ->selectRaw('agent_code, COUNT(*) AS aggregate')
            ->whereNull('deleted_at')
            ->groupBy('agent_code')
            ->havingRaw('COUNT(*) > 1')
            ->first();
        if ($duplicateMarket !== null) {
            throw new RuntimeException(sprintf('Duplicate active market records: agent_code=%s count=%d', $duplicateMarket['agent_code'], $duplicateMarket['aggregate']));
        }

        $duplicateOwnership = Db::table('magic_super_magic_user_agents')
            ->selectRaw('organization_code, user_id, agent_code, COUNT(*) AS aggregate')
            ->whereNull('deleted_at')
            ->groupBy(['organization_code', 'user_id', 'agent_code'])
            ->havingRaw('COUNT(*) > 1')
            ->first();
        if ($duplicateOwnership !== null) {
            throw new RuntimeException(sprintf(
                'Duplicate active user agent records: organization_code=%s user_id=%s agent_code=%s count=%d',
                $duplicateOwnership['organization_code'],
                $duplicateOwnership['user_id'],
                $duplicateOwnership['agent_code'],
                $duplicateOwnership['aggregate']
            ));
        }

        $orphanMarket = Db::table('magic_super_magic_agent_market as market')
            ->leftJoin('magic_super_magic_agent_versions as version', 'version.id', '=', 'market.agent_version_id')
            ->whereNull('market.deleted_at')
            ->whereNull('version.id')
            ->select(['market.agent_code', 'market.agent_version_id'])
            ->first();
        if ($orphanMarket !== null) {
            throw new RuntimeException(sprintf('Market record has no version: agent_code=%s version_id=%s', $orphanMarket['agent_code'], $orphanMarket['agent_version_id']));
        }

        $unresolvedMarket = Db::table('magic_super_magic_agent_market as market')
            ->join('magic_super_magic_agent_versions as version', 'version.id', '=', 'market.agent_version_id')
            ->whereNull('market.deleted_at')
            ->where(function ($query) {
                $query->whereNull('market.market_type')->orWhere('market.market_type', '');
            })
            ->whereNotIn('version.publish_target_type', [
                PublishTargetType::MARKET->value,
                PublishTargetType::ORGANIZATION->value,
                PublishTargetType::MEMBER->value,
            ])
            ->select(['market.agent_code', 'market.agent_version_id', 'version.publish_target_type'])
            ->first();
        if ($unresolvedMarket !== null) {
            throw new RuntimeException(sprintf(
                'Unable to resolve market_type: agent_code=%s version_id=%s publish_target_type=%s',
                $unresolvedMarket['agent_code'],
                $unresolvedMarket['agent_version_id'],
                $unresolvedMarket['publish_target_type']
            ));
        }

        $invalidMarketType = Db::table('magic_super_magic_agent_market')
            ->whereNull('deleted_at')
            ->whereNotNull('market_type')
            ->where('market_type', '<>', '')
            ->whereNotIn('market_type', [AgentMarketType::MARKET->value, AgentMarketType::ORGANIZATION->value])
            ->select(['agent_code', 'agent_version_id', 'market_type'])
            ->first();
        if ($invalidMarketType !== null) {
            throw new RuntimeException(sprintf(
                'Unknown market_type: agent_code=%s version_id=%s market_type=%s',
                $invalidMarketType['agent_code'],
                $invalidMarketType['agent_version_id'],
                $invalidMarketType['market_type']
            ));
        }
    }

    private function candidateQuery(): mixed
    {
        return Db::table('magic_super_magic_agent_versions')
            ->select(['id', 'code'])
            ->whereIn('publish_target_type', [PublishTargetType::ORGANIZATION->value, PublishTargetType::MEMBER->value])
            ->where('publish_status', PublishStatus::PUBLISHED->value)
            ->where('is_current_version', true)
            ->whereNull('deleted_at')
            ->orderBy('id');
    }

    /** @return array{market:int,organization:int,updated:int} */
    private function backfillMarketTypes(): array
    {
        $base = Db::table('magic_super_magic_agent_market as market')
            ->join('magic_super_magic_agent_versions as version', 'version.id', '=', 'market.agent_version_id')
            ->whereNull('market.deleted_at')
            ->whereNull('version.deleted_at')
            ->where(function ($query) {
                $query->whereNull('market.market_type')->orWhere('market.market_type', '');
            });
        $marketCount = (clone $base)->where('version.publish_target_type', PublishTargetType::MARKET->value)->count();
        $organizationCount = (clone $base)->whereIn('version.publish_target_type', [PublishTargetType::ORGANIZATION->value, PublishTargetType::MEMBER->value])->count();
        if ($marketCount > 0) {
            (clone $base)->where('version.publish_target_type', PublishTargetType::MARKET->value)->update(['market_type' => AgentMarketType::MARKET->value]);
        }
        if ($organizationCount > 0) {
            (clone $base)->whereIn('version.publish_target_type', [PublishTargetType::ORGANIZATION->value, PublishTargetType::MEMBER->value])->update(['market_type' => AgentMarketType::ORGANIZATION->value]);
        }

        return ['market' => $marketCount, 'organization' => $organizationCount, 'updated' => $marketCount + $organizationCount];
    }

    /** @param array{version:SuperMagicAgentVersionDomainService,market:SuperMagicAgentMarketDomainService,user_agent:UserAgentDomainService,visibility:ResourceVisibilityDomainService} $services */
    private function migrateVersion(AgentVersionEntity $version, array $services): array
    {
        $dataIsolation = SuperMagicAgentDataIsolation::create($version->getOrganizationCode(), $version->getCreator());
        $permissionIsolation = PermissionDataIsolation::create($version->getOrganizationCode(), $version->getCreator());
        $market = $services['version']->publishOrganizationSharedMarket($dataIsolation, $version);
        $marketId = (int) $market->getId();
        if ($marketId <= 0) {
            throw new RuntimeException('Organization shared market record was not created');
        }
        $this->saveMarketShelfVisibility($permissionIsolation, $version, $marketId, $services['visibility']);

        $topicHitUsers = $this->findTopicHitUserIds($version->getOrganizationCode(), $version->getCode());
        $topicHitMap = array_fill_keys($topicHitUsers, true);
        $sources = [];
        foreach ($topicHitUsers as $userId) {
            $sources[$userId] = $services['market']->getVersionMarketDiscoverabilitySourcesForUser($permissionIsolation, $version, $userId);
        }
        $ownerships = $services['user_agent']->findAllUserAgentOwnershipsByCode($dataIsolation, $version->getCode());
        $processedUsers = [];
        $stats = ['created_hires' => 0, 'compensated_hires' => 0, 'converted_legacy_ownerships' => 0, 'deleted_legacy_ownerships' => 0, 'out_of_scope_topic_users' => 0, 'preserved_creator_ownerships' => 0, 'skipped_conflicting_ownerships' => 0];

        foreach ($ownerships as $ownership) {
            $userId = $ownership->getUserId();
            $processedUsers[$userId] = true;
            $hasTopicUsage = isset($topicHitMap[$userId]);
            if ($userId === $version->getCreator()) {
                ++$stats['preserved_creator_ownerships'];
                continue;
            }
            $isDiscoverable = ($sources[$userId] ?? $services['market']->getVersionMarketDiscoverabilitySourcesForUser($permissionIsolation, $version, $userId)) !== [];

            if ($ownership->getSourceType() === AgentSourceType::LOCAL_CREATE) {
                if ($hasTopicUsage && $isDiscoverable) {
                    $this->saveMarketOwnership($version, $marketId, $userId, $services['user_agent'], $ownership);
                    ++$stats['converted_legacy_ownerships'];
                } else {
                    if ($services['user_agent']->deleteUserAgentOwnership(SuperMagicAgentDataIsolation::create($version->getOrganizationCode(), $userId), $version->getCode())) {
                        ++$stats['deleted_legacy_ownerships'];
                    }
                    if ($hasTopicUsage) {
                        ++$stats['out_of_scope_topic_users'];
                    }
                }
                continue;
            }

            if ($ownership->getSourceType() === AgentSourceType::MARKET) {
                if ($ownership->getSourceId() !== $marketId) {
                    ++$stats['skipped_conflicting_ownerships'];
                    continue;
                }
                if (! $isDiscoverable) {
                    $deleted = $services['user_agent']->deleteUserAgentOwnershipsByMarketSourceAndUsers($dataIsolation, $marketId, [$userId]);
                    $stats['deleted_legacy_ownerships'] += $deleted > 0 ? 1 : 0;
                    if ($hasTopicUsage) {
                        ++$stats['out_of_scope_topic_users'];
                    }
                    continue;
                }
                // migration 固定使用 Command --force 语义，补齐当前市场和版本来源。
                $this->saveMarketOwnership($version, $marketId, $userId, $services['user_agent'], $ownership);
                ++$stats['compensated_hires'];
                continue;
            }
            ++$stats['skipped_conflicting_ownerships'];
        }

        foreach ($topicHitUsers as $userId) {
            if ($userId === $version->getCreator() || isset($processedUsers[$userId])) {
                continue;
            }
            if (($sources[$userId] ?? []) === []) {
                ++$stats['out_of_scope_topic_users'];
                continue;
            }
            $this->saveMarketOwnership($version, $marketId, $userId, $services['user_agent']);
            ++$stats['created_hires'];
        }

        $services['market']->syncOrganizationMarketHireAccess($permissionIsolation, $market);
        $stats['processed_versions'] = 1;
        $stats['market_records'] = 1;
        $stats['shelf_records'] = 1;
        $stats['topic_hit_users'] = count($topicHitUsers);
        return $stats;
    }

    private function saveMarketShelfVisibility(PermissionDataIsolation $isolation, AgentVersionEntity $version, int $marketId, ResourceVisibilityDomainService $service): void
    {
        if ($version->getPublishTargetType() === PublishTargetType::ORGANIZATION) {
            $service->saveVisibilityByPrincipals($isolation, VisibilityResourceType::SUPER_MAGIC_AGENT_MARKET, (string) $marketId, VisibilityType::ALL);
            return;
        }

        $target = $version->getPublishTargetValue();
        if (($target?->getUserIds() ?? []) === [] && ($target?->getDepartmentIds() ?? []) === []) {
            throw new RuntimeException('MEMBER publish target is empty');
        }
        $service->saveVisibilityByPrincipals(
            $isolation,
            VisibilityResourceType::SUPER_MAGIC_AGENT_MARKET,
            (string) $marketId,
            VisibilityType::SPECIFIC,
            $target?->getUserIds() ?? [],
            $target?->getDepartmentIds() ?? []
        );
    }

    private function saveMarketOwnership(AgentVersionEntity $version, int $marketId, string $userId, UserAgentDomainService $service, ?UserAgentEntity $existing = null): void
    {
        $ownership = (new UserAgentEntity())
            ->setOrganizationCode($version->getOrganizationCode())
            ->setUserId($userId)
            ->setAgentCode($version->getCode())
            ->setAgentVersionId($version->getId())
            ->setSourceType(AgentSourceType::MARKET)
            ->setSourceId($marketId);
        if ($existing?->getId() !== null) {
            $ownership->setId($existing->getId());
        }
        $service->saveUserAgentOwnership(SuperMagicAgentDataIsolation::create($version->getOrganizationCode(), $userId), $ownership);
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

    /** @return array<string,mixed> */
    private function mergeStats(array $stats, array $result): array
    {
        foreach ($result as $key => $value) {
            $stats[$key] = (int) ($stats[$key] ?? 0) + (int) $value;
        }

        return $stats;
    }

    /** @return array<string,mixed> */
    private function newStats(array $marketTypeStats): array
    {
        return [
            'market_type_backfill' => $marketTypeStats,
            'processed_versions' => 0,
            'market_records' => 0,
            'shelf_records' => 0,
            'topic_hit_users' => 0,
            'created_hires' => 0,
            'compensated_hires' => 0,
            'converted_legacy_ownerships' => 0,
            'deleted_legacy_ownerships' => 0,
            'out_of_scope_topic_users' => 0,
            'preserved_creator_ownerships' => 0,
            'skipped_conflicting_ownerships' => 0,
            'skipped_versions' => 0,
        ];
    }

    private function output(string $message): void
    {
        // migration 在部署日志中输出批次进度和最终聚合统计。
        if (defined('STDOUT')) {
            fwrite(STDOUT, $message . PHP_EOL);
        }
    }
};
