<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Agent\Command;

use App\Application\SuperMagic\Task\Service\AgentAppService;
use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Domain\SuperMagic\Agent\Entity\MagicClawEntity;
use App\Domain\SuperMagic\Agent\Service\MagicClawDomainService;
use App\Domain\SuperMagic\Topic\Entity\TopicEntity;
use App\Domain\SuperMagic\Topic\Service\TopicDomainService;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\Constant\SandboxStatus;
use Hyperf\Command\Annotation\Command;
use Hyperf\Command\Command as HyperfCommand;
use Hyperf\Logger\LoggerFactory;
use InvalidArgumentException;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Input\InputOption;
use Throwable;

/**
 * 重启“正在运行”的 Magic Claw 沙箱。
 *
 * 运行集合以沙箱网关返回的 pod 清单为准（GET /api/v1/sandboxes），不再从 magic_super_magic_claw
 * 表反推：已经退出、或从未创建过沙箱的龙虾不会被重新拉起。
 */
#[Command]
class RestartAllMagicClawSandboxCommand extends HyperfCommand
{
    /**
     * --status 的特殊取值：不向网关传状态过滤，清单包含所有状态的沙箱（旧行为）。
     */
    private const STATUS_FILTER_ANY = 'any';

    protected ?string $name = 'magic-claw:restart-sandbox-all';

    private LoggerInterface $logger;

    public function __construct(
        private readonly MagicClawDomainService $magicClawDomainService,
        private readonly TopicDomainService $topicDomainService,
        private readonly AgentAppService $agentAppService,
        LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory->get('magic-claw-restart-sandbox-all');
        parent::__construct();
    }

    public function configure(): void
    {
        parent::configure();
        $this->setDescription('Restart sandboxes of running Magic Claws (gateway sandbox list, default status Running)');
        $this->addOption('dry-run', null, InputOption::VALUE_NONE, 'List targets without restarting sandboxes');
        $this->addOption('code', null, InputOption::VALUE_OPTIONAL, 'Restart only the Magic Claw with this code');
        $this->addOption(
            'status',
            null,
            InputOption::VALUE_OPTIONAL,
            'Comma separated sandbox statuses to list from the gateway, or "any" to disable the status filter',
            SandboxStatus::RUNNING
        );
        $this->addOption('limit', null, InputOption::VALUE_OPTIONAL, 'Maximum sandboxes to restart, 0 means unlimited', 0);
        $this->addOption('sleep-ms', null, InputOption::VALUE_OPTIONAL, 'Sleep milliseconds after each restart', 0);
    }

    public function handle(): int
    {
        $dryRun = (bool) $this->input->getOption('dry-run');
        $limit = max(0, (int) $this->input->getOption('limit'));
        $sleepMs = max(0, (int) $this->input->getOption('sleep-ms'));
        $code = trim((string) $this->input->getOption('code'));

        try {
            $statusFilter = $this->parseStatusFilter((string) $this->input->getOption('status'));
        } catch (InvalidArgumentException $e) {
            $this->error($e->getMessage());
            return self::FAILURE;
        }

        $this->info('Listing sandboxes from the sandbox gateway...');
        $this->line(sprintf(
            'Options: dry_run=%s, code=%s, status=%s, limit=%d, sleep_ms=%d',
            $dryRun ? 'true' : 'false',
            $code === '' ? 'all' : $code,
            $statusFilter === [] ? self::STATUS_FILTER_ANY : implode(',', $statusFilter),
            $limit,
            $sleepMs
        ));

        try {
            $sandboxList = $this->agentAppService->listSandboxes($statusFilter);
        } catch (Throwable $e) {
            $this->error('Failed to list sandboxes from the sandbox gateway: ' . $e->getMessage());
            $this->logger->error('Failed to list sandboxes from the sandbox gateway', [
                'status_filter' => $statusFilter,
                'exception' => get_class($e),
                'error' => $e->getMessage(),
            ]);
            return self::FAILURE;
        }

        // 网关按 sandbox_id 返回，这里改成“跑得最久的沙箱先重启”，让 --limit 变成有意义的灰度放量。
        $sandboxes = $this->sortBySandboxAge($sandboxList->getSandboxes());
        $statusCounts = $sandboxList->getStatusCounts();

        $stats = [
            'listed' => count($sandboxes),
            'matched' => 0,
            'restarted' => 0,
            'skipped' => 0,
            'failed' => 0,
        ];

        // 沙箱 → 话题 → 龙虾：网关只认识 pod，归属关系仍然要回业务表确认。
        $topicBySandboxId = $this->resolveTopicsBySandboxId($sandboxes);
        $clawByProjectId = $this->resolveClawsByProjectId($topicBySandboxId);

        $handledTopicIds = [];
        foreach ($sandboxes as $sandbox) {
            $sandboxId = (string) $sandbox['sandbox_id'];
            $status = (string) $sandbox['status'];

            $topic = $topicBySandboxId[$sandboxId] ?? null;
            if ($topic === null) {
                $this->skip($stats, $sandboxId, $status, 'no topic matches this sandbox');
                continue;
            }

            $topicId = $topic->getId();
            $claw = $clawByProjectId[$topic->getProjectId()] ?? null;
            if ($claw === null) {
                $this->skip($stats, $sandboxId, $status, 'project is not a Magic Claw');
                continue;
            }

            // --code 是精确过滤，其它龙虾静默跳过（与旧行为一致，不计入统计）。
            if ($code !== '' && $claw->getCode() !== $code) {
                continue;
            }

            if (isset($handledTopicIds[$topicId])) {
                $this->skip($stats, $sandboxId, $status, sprintf('topic %d already handled by another sandbox', $topicId));
                continue;
            }

            if ($limit > 0 && $stats['matched'] >= $limit) {
                break;
            }

            ++$stats['matched'];
            $handledTopicIds[$topicId] = true;
            $createdAt = (string) $sandbox['created_at'];
            $this->line(sprintf(
                '[TARGET] code=%s, sandbox_id=%s, status=%s, created_at=%s, topic_id=%d, project_id=%d',
                $claw->getCode(),
                $sandboxId,
                $status,
                $createdAt === '' ? 'unknown' : $createdAt,
                $topicId,
                $topic->getProjectId()
            ));

            if ($dryRun) {
                continue;
            }

            try {
                $restartedSandboxId = $this->restartSandbox($topic);
                ++$stats['restarted'];
                $this->info(sprintf('[OK] code=%s, sandbox_id=%s', $claw->getCode(), $restartedSandboxId));
                $this->logger->info('Magic Claw sandbox restarted', [
                    'code' => $claw->getCode(),
                    'user_id' => $topic->getUserId(),
                    'organization_code' => $topic->getUserOrganizationCode(),
                    'project_id' => $topic->getProjectId(),
                    'topic_id' => $topicId,
                    'previous_sandbox_id' => $sandboxId,
                    'previous_status' => $status,
                    'previous_sandbox_created_at' => $createdAt,
                    'sandbox_id' => $restartedSandboxId,
                ]);

                if ($sleepMs > 0) {
                    usleep($sleepMs * 1000);
                }
            } catch (Throwable $e) {
                ++$stats['failed'];
                $this->error(sprintf(
                    '[FAIL] code=%s, sandbox_id=%s, topic_id=%d, error=%s',
                    $claw->getCode(),
                    $sandboxId,
                    $topicId,
                    $e->getMessage()
                ));
                $this->logger->error('Failed to restart Magic Claw sandbox', [
                    'code' => $claw->getCode(),
                    'user_id' => $topic->getUserId(),
                    'organization_code' => $topic->getUserOrganizationCode(),
                    'project_id' => $topic->getProjectId(),
                    'topic_id' => $topicId,
                    'sandbox_id' => $sandboxId,
                    'exception' => get_class($e),
                    'error' => $e->getMessage(),
                ]);
            }
        }

        if ($code !== '' && $stats['matched'] === 0) {
            $this->line(sprintf(
                '[NOT_FOUND] No running Magic Claw sandbox for code: %s (status=%s)',
                $code,
                $statusFilter === [] ? self::STATUS_FILTER_ANY : implode(',', $statusFilter)
            ));
        }

        $this->printSummary($stats, $statusCounts, $statusFilter);
        return self::SUCCESS;
    }

    /**
     * 重启沙箱：以话题归属者身份发起，restartSandbox 会校验话题归属，用话题 owner 才能通过。
     */
    protected function restartSandbox(TopicEntity $topic): string
    {
        return $this->agentAppService->restartSandbox($this->createDataIsolation($topic), $topic->getId());
    }

    /**
     * 按 pod 创建时间升序排列：跑得最久的沙箱先重启，重启后会拿到新沙箱（新时间），
     * 因此配 --limit 反复执行天然是“老的先、重启过的排到后面”。
     *
     * created_at 缺失（老网关不返回该字段）时视为未知并排到最后；PHP 8 的排序是稳定的，
     * 所以全部未知时会保持网关给的 sandbox_id 升序。
     *
     * @param array<int, array{sandbox_id: string, status: string, project_id: string, topic_id: string, warm_pool: bool, bound: bool, created_at: string}> $sandboxes
     * @return array<int, array{sandbox_id: string, status: string, project_id: string, topic_id: string, warm_pool: bool, bound: bool, created_at: string}>
     */
    private function sortBySandboxAge(array $sandboxes): array
    {
        usort($sandboxes, static function (array $left, array $right): int {
            return self::sandboxCreatedAtTimestamp($left['created_at']) <=> self::sandboxCreatedAtTimestamp($right['created_at']);
        });

        return $sandboxes;
    }

    /**
     * 未知时间统一放到最后，避免“缺字段”被当成 1970 年从而抢占最先重启的位置。
     */
    private static function sandboxCreatedAtTimestamp(string $createdAt): int
    {
        if ($createdAt === '') {
            return PHP_INT_MAX;
        }

        $timestamp = strtotime($createdAt);
        return $timestamp === false ? PHP_INT_MAX : $timestamp;
    }

    /**
     * 把网关返回的沙箱映射回话题。
     *
     * 首选 pod 上的 topic-id 标签（PHP 冷启动与温池挂载都会打）；标签缺失时退化为
     * “沙箱 ID 即话题 ID”的历史约定，并要求话题记录的 sandbox_id 与之吻合，避免温池
     * 生成的雪花 ID 撞上真实话题 ID 时误伤别的话题。
     *
     * @param array<int, array{sandbox_id: string, status: string, project_id: string, topic_id: string, warm_pool: bool, bound: bool, created_at: string}> $sandboxes
     * @return array<string, TopicEntity> sandboxId => topic
     */
    private function resolveTopicsBySandboxId(array $sandboxes): array
    {
        $candidateTopicIds = [];
        foreach ($sandboxes as $sandbox) {
            $topicId = $this->resolveCandidateTopicId($sandbox);
            if ($topicId !== null) {
                $candidateTopicIds[$topicId] = $topicId;
            }
        }

        if ($candidateTopicIds === []) {
            return [];
        }

        $topicById = [];
        foreach ($this->topicDomainService->getTopicsByIds(array_values($candidateTopicIds)) as $topic) {
            $topicById[$topic->getId()] = $topic;
        }

        $result = [];
        foreach ($sandboxes as $sandbox) {
            $sandboxId = (string) $sandbox['sandbox_id'];
            $topicId = $this->resolveCandidateTopicId($sandbox);
            $topic = $topicId === null ? null : ($topicById[$topicId] ?? null);
            if ($topic === null) {
                continue;
            }

            // 走沙箱 ID 兜底时，必须确认话题自己记的就是这个沙箱。
            $labelTopicId = (int) ($sandbox['topic_id'] ?? 0);
            $persistedSandboxId = $topic->getSandboxId();
            if ($labelTopicId <= 0 && $persistedSandboxId !== '' && $persistedSandboxId !== $sandboxId) {
                continue;
            }

            $result[$sandboxId] = $topic;
        }

        return $result;
    }

    /**
     * @param array{sandbox_id: string, topic_id: string} $sandbox
     */
    private function resolveCandidateTopicId(array $sandbox): ?int
    {
        $labelTopicId = (int) ($sandbox['topic_id'] ?? 0);
        if ($labelTopicId > 0) {
            return $labelTopicId;
        }

        $sandboxId = (string) ($sandbox['sandbox_id'] ?? '');
        $sandboxIdInt = (int) $sandboxId;
        if ($sandboxIdInt > 0 && (string) $sandboxIdInt === $sandboxId) {
            return $sandboxIdInt;
        }

        return null;
    }

    /**
     * @param array<string, TopicEntity> $topicBySandboxId
     * @return array<int, MagicClawEntity> projectId => claw
     */
    private function resolveClawsByProjectId(array $topicBySandboxId): array
    {
        $projectIds = [];
        foreach ($topicBySandboxId as $topic) {
            $projectId = $topic->getProjectId();
            if ($projectId > 0) {
                $projectIds[$projectId] = $projectId;
            }
        }

        if ($projectIds === []) {
            return [];
        }

        return $this->magicClawDomainService->getByProjectIds(array_values($projectIds));
    }

    /**
     * 解析 --status：空值或 any 表示不过滤（返回空数组）。
     *
     * @return string[] 规范化后的状态列表
     * @throws InvalidArgumentException 出现未知状态时抛出
     */
    private function parseStatusFilter(string $option): array
    {
        $option = trim($option);
        if ($option === '' || strcasecmp($option, self::STATUS_FILTER_ANY) === 0) {
            return [];
        }

        $allowed = [];
        foreach (SandboxStatus::getAllStatuses() as $status) {
            $allowed[strtolower($status)] = $status;
        }

        $filter = [];
        foreach (explode(',', $option) as $status) {
            $status = trim($status);
            if ($status === '') {
                continue;
            }

            $canonical = $allowed[strtolower($status)] ?? null;
            if ($canonical === null) {
                throw new InvalidArgumentException(sprintf(
                    'Invalid --status value "%s", allowed: %s, or "any" to disable the filter',
                    $status,
                    implode(', ', SandboxStatus::getAllStatuses())
                ));
            }
            $filter[$canonical] = $canonical;
        }

        return array_values($filter);
    }

    private function createDataIsolation(TopicEntity $topic): DataIsolation
    {
        $dataIsolation = DataIsolation::create($topic->getUserOrganizationCode(), $topic->getUserId());
        $dataIsolation->setThirdPartyOrganizationCode($topic->getUserOrganizationCode());
        return $dataIsolation;
    }

    /**
     * @param array{listed: int, matched: int, restarted: int, skipped: int, failed: int} $stats
     */
    private function skip(array &$stats, string $sandboxId, string $status, string $reason): void
    {
        ++$stats['skipped'];
        $this->line(sprintf(
            '[SKIP] sandbox_id=%s, status=%s, reason=%s',
            $sandboxId,
            $status === '' ? 'unknown' : $status,
            $reason
        ));
    }

    /**
     * @param array{listed: int, matched: int, restarted: int, skipped: int, failed: int} $stats
     * @param array<string, int> $statusCounts
     * @param string[] $statusFilter
     */
    private function printSummary(array $stats, array $statusCounts = [], array $statusFilter = []): void
    {
        $this->line('');
        $this->info('Magic Claw sandbox restart summary:');
        $this->line('  status_filter: ' . ($statusFilter === [] ? self::STATUS_FILTER_ANY . ' (disabled)' : implode(',', $statusFilter)));
        $this->line('  listed: ' . $stats['listed']);
        $this->line('  matched: ' . $stats['matched']);
        $this->line('  restarted: ' . $stats['restarted']);
        $this->line('  skipped: ' . $stats['skipped']);
        $this->line('  failed: ' . $stats['failed']);

        if ($statusCounts !== []) {
            arsort($statusCounts);
            $parts = [];
            foreach ($statusCounts as $status => $count) {
                $parts[] = $status . '=' . $count;
            }
            $this->line('  sandbox_statuses: ' . implode(', ', $parts));
        }

        $this->logger->info('Magic Claw sandbox restart command finished', $stats + [
            'status_filter' => $statusFilter === [] ? self::STATUS_FILTER_ANY : $statusFilter,
            'status_counts' => $statusCounts,
        ]);
    }
}
