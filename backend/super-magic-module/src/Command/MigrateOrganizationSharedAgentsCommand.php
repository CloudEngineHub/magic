<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Command;

use App\Domain\Permission\Entity\ValueObject\PermissionDataIsolation;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\PrincipalType;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\ResourceType as ResourceVisibilityResourceType;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\VisibilityType;
use App\Domain\Permission\Service\ResourceVisibilityDomainService;
use Dtyq\SuperMagic\Domain\Agent\Entity\AgentVersionEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\UserAgentEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\AgentSourceType;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\PublishStatus;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\PublishTargetType;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\SuperMagicAgentDataIsolation;
use Dtyq\SuperMagic\Domain\Agent\Service\SuperMagicAgentVersionDomainService;
use Dtyq\SuperMagic\Domain\Agent\Service\UserAgentDomainService;
use Hyperf\Command\Annotation\Command;
use Hyperf\Command\Command as HyperfCommand;
use Hyperf\DbConnection\Db;
use RuntimeException;
use Symfony\Component\Console\Input\InputOption;

/**
 * 一次性历史数据迁移命令。
 *
 * 该命令在组织共享雇佣制上线时执行，完成后应从代码库删除；不能把这类业务
 * 数据修复放进 Schema migration，也不复用为任何在线接口或领域服务。
 */
#[Command]
class MigrateOrganizationSharedAgentsCommand extends HyperfCommand
{
    public function __construct(
        private readonly SuperMagicAgentVersionDomainService $versionDomainService,
        private readonly UserAgentDomainService $userAgentDomainService,
        private readonly ResourceVisibilityDomainService $resourceVisibilityDomainService,
    ) {
        parent::__construct('super-magic:migrate-organization-shared-agents');
    }

    public function configure(): void
    {
        parent::configure();
        $this->setDescription('一次性迁移组织共享员工的市场货架和历史 Topic 雇佣关系');
        $this->addOption('agent-code', null, InputOption::VALUE_REQUIRED, '仅迁移指定员工');
        $this->addOption('page', null, InputOption::VALUE_REQUIRED, '页码', '1');
        $this->addOption('page-size', null, InputOption::VALUE_REQUIRED, '每页数量', '100');
        $this->addOption('dry-run', 'd', InputOption::VALUE_NONE, '仅输出统计，不写入');
        $this->addOption('force', 'f', InputOption::VALUE_NONE, '补偿已存在的市场来源雇佣关系');
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

    /**
     * 固定顺序：公开市场组织码修正 → 市场记录 → 货架可见性 → Topic 命中雇佣关系。
     * dry-run 只输出受影响范围；force 只补偿已有的 MARKET 来源关系。
     *
     * @return array<string, mixed>
     */
    private function migrate(?string $agentCode, int $page, int $pageSize, bool $dryRun, bool $force): array
    {
        $page = max(1, $page);
        $pageSize = min(max(1, $pageSize), 200);
        $query = Db::table('magic_super_magic_agent_versions')
            ->select(['id', 'code'])
            ->whereIn('publish_target_type', [PublishTargetType::ORGANIZATION->value, PublishTargetType::MEMBER->value])
            ->where('publish_status', PublishStatus::PUBLISHED->value)
            ->where('is_current_version', true)
            ->whereNull('deleted_at')
            ->orderBy('id');
        if (($agentCode = trim((string) $agentCode)) !== '') {
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
            'public_market_records_normalized' => $this->normalizePublicMarketOrganizationCodes($dryRun),
            'processed_versions' => [],
            'market_records' => 0,
            'shelf_records' => 0,
            'topic_hit_users' => [],
            'created_hires' => 0,
            'skipped' => 0,
            'compensated' => 0,
        ];

        foreach ($rows as $row) {
            $version = $this->versionDomainService->findByIdWithoutOrganizationFilter((int) $row['id']);
            if ($version === null || ! in_array($version->getPublishTargetType(), [PublishTargetType::ORGANIZATION, PublishTargetType::MEMBER], true)) {
                ++$stats['skipped'];
                continue;
            }

            $result = $dryRun
                ? $this->previewVersion($version)
                : Db::transaction(fn (): array => $this->migrateVersion($version, $force));

            $stats['processed_versions'][] = $result['version'];
            $stats['market_records'] += $result['market_records'];
            $stats['shelf_records'] += $result['shelf_records'];
            $stats['created_hires'] += $result['created_hires'];
            $stats['compensated'] += $result['compensated'];
            $stats['topic_hit_users'] = array_values(array_unique(array_merge($stats['topic_hit_users'], $result['topic_hit_users'])));
        }

        return $stats;
    }

    /**
     * 公开市场的 organization_code 必须为 NULL；组织共享市场才保存组织 code。
     * 这是历史数据修正，故放在一次性 Command 中而不是 Schema migration。
     */
    private function normalizePublicMarketOrganizationCodes(bool $dryRun): int
    {
        $query = Db::table('magic_super_magic_agent_market as market')
            ->join('magic_super_magic_agent_versions as version', 'version.id', '=', 'market.agent_version_id')
            ->where('version.publish_target_type', PublishTargetType::MARKET->value)
            ->whereNotNull('market.organization_code');
        $affected = $query->count();
        if (! $dryRun && $affected > 0) {
            Db::statement(
                "UPDATE magic_super_magic_agent_market market\n"
                . "INNER JOIN magic_super_magic_agent_versions version ON version.id = market.agent_version_id\n"
                . "SET market.organization_code = NULL\n"
                . "WHERE version.publish_target_type = 'MARKET' AND market.organization_code IS NOT NULL"
            );
        }

        return $affected;
    }

    /** @return array<string, mixed> */
    private function previewVersion(AgentVersionEntity $version): array
    {
        return $this->resultForVersion(
            $version,
            $this->findTopicHitUserIds($version->getOrganizationCode(), $version->getCode()),
            0,
            0
        );
    }

    /** @return array<string, mixed> */
    private function migrateVersion(AgentVersionEntity $version, bool $force): array
    {
        $dataIsolation = SuperMagicAgentDataIsolation::create($version->getOrganizationCode(), $version->getCreator());
        $permissionIsolation = PermissionDataIsolation::create($version->getOrganizationCode(), $version->getCreator());
        $market = $this->versionDomainService->publishOrganizationSharedMarket($dataIsolation, $version);
        $marketId = (int) $market->getId();
        if ($marketId <= 0) {
            throw new RuntimeException('Organization shared market record was not created');
        }

        if ($version->getPublishTargetType() === PublishTargetType::ORGANIZATION) {
            $this->resourceVisibilityDomainService->saveVisibilityByPrincipals(
                $permissionIsolation,
                ResourceVisibilityResourceType::SUPER_MAGIC_AGENT_MARKET,
                (string) $marketId,
                VisibilityType::ALL
            );
        } else {
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

        $createdHires = 0;
        $compensated = 0;
        $topicHitUsers = $this->findTopicHitUserIds($version->getOrganizationCode(), $version->getCode());
        foreach ($topicHitUsers as $userId) {
            $visibleIds = $this->resourceVisibilityDomainService->getUserAccessibleResourceCodes(
                $permissionIsolation,
                $userId,
                ResourceVisibilityResourceType::SUPER_MAGIC_AGENT_MARKET,
                [(string) $marketId]
            );
            if (! in_array((string) $marketId, $visibleIds, true)) {
                continue;
            }

            $userIsolation = SuperMagicAgentDataIsolation::create($version->getOrganizationCode(), $userId);
            $existing = $this->userAgentDomainService->findUserAgentOwnershipByCode($userIsolation, $version->getCode());
            if ($existing !== null && ! $existing->getSourceType()->isMarket()) {
                continue;
            }
            if ($existing !== null && ! $force) {
                continue;
            }

            $ownership = (new UserAgentEntity())
                ->setOrganizationCode($version->getOrganizationCode())
                ->setUserId($userId)
                ->setAgentCode($version->getCode())
                ->setAgentVersionId($version->getId())
                ->setSourceType(AgentSourceType::MARKET)
                ->setSourceId($marketId);
            $this->userAgentDomainService->saveUserAgentOwnership($userIsolation, $ownership);
            $this->resourceVisibilityDomainService->addResourceVisibilityByPrincipalsIfMissing(
                $permissionIsolation,
                ResourceVisibilityResourceType::SUPER_MAGIC_AGENT,
                $version->getCode(),
                PrincipalType::USER,
                [$userId]
            );
            $existing === null ? ++$createdHires : ++$compensated;
        }

        // 历史员工可见性可能仍是 ALL/部门范围；迁移后仅保留创建者和有效雇佣者，
        // 防止“市场货架可见”经旧兼容链路升级成完整详情权限。
        $revokedUserIds = [];
        foreach ($this->userAgentDomainService->findUserAgentOwnershipsByMarketSource($dataIsolation, $marketId) as $ownership) {
            $visibleIds = $this->resourceVisibilityDomainService->getUserAccessibleResourceCodes(
                $permissionIsolation,
                $ownership->getUserId(),
                ResourceVisibilityResourceType::SUPER_MAGIC_AGENT_MARKET,
                [(string) $marketId]
            );
            if (! in_array((string) $marketId, $visibleIds, true)) {
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

        $hiredUserIds = array_map(
            static fn (UserAgentEntity $ownership): string => $ownership->getUserId(),
            $this->userAgentDomainService->findUserAgentOwnershipsByMarketSource($dataIsolation, $marketId)
        );
        $this->resourceVisibilityDomainService->saveVisibilityByPrincipals(
            $permissionIsolation,
            ResourceVisibilityResourceType::SUPER_MAGIC_AGENT,
            $version->getCode(),
            VisibilityType::SPECIFIC,
            array_values(array_unique(array_merge([$version->getCreator()], $hiredUserIds)))
        );

        return $this->resultForVersion($version, $topicHitUsers, $createdHires, $compensated);
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

    /** @return array<string, mixed> */
    private function resultForVersion(AgentVersionEntity $version, array $topicHitUsers, int $createdHires, int $compensated): array
    {
        return [
            'version' => [
                'id' => $version->getId(),
                'agent_code' => $version->getCode(),
                'organization_code' => $version->getOrganizationCode(),
            ],
            'market_records' => 1,
            'shelf_records' => 1,
            'topic_hit_users' => $topicHitUsers,
            'created_hires' => $createdHires,
            'compensated' => $compensated,
        ];
    }
}
