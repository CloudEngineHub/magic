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
use Hyperf\Coroutine\Coroutine;
use Hyperf\Coroutine\Parallel;
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

    /**
     * 每处理多少个目标至少打一行进度。
     */
    private const PROGRESS_EVERY = 10;

    /**
     * 距上次进度行超过多少秒就补一行（单个沙箱重建可能十几秒）。
     */
    private const PROGRESS_INTERVAL_SECONDS = 30.0;

    protected ?string $name = 'magic-claw:restart-sandbox-all';

    private LoggerInterface $logger;

    /**
     * 上次打印进度行时的相对耗时，用于按时间节流。
     */
    private float $lastProgressAt = 0.0;

    /**
     * 已处理完的目标数（成功或失败都算），并发模式下由各协程共同累加。
     */
    private int $completedTargets = 0;

    /**
     * 已删除的旧沙箱数。
     */
    private int $deletedSandboxes = 0;

    /**
     * 已重建成功的沙箱数。
     */
    private int $restartedSandboxes = 0;

    /**
     * 重建失败的沙箱数。
     */
    private int $failedSandboxes = 0;

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
        $this->addOption(
            'concurrency',
            null,
            InputOption::VALUE_OPTIONAL,
            'How many Magic Claws to restart in parallel (1 = sequential; each claw still waits for its own sandbox to be ready)',
            1
        );
    }

    public function handle(): int
    {
        $dryRun = (bool) $this->input->getOption('dry-run');
        $limit = max(0, (int) $this->input->getOption('limit'));
        $concurrency = max(1, (int) $this->input->getOption('concurrency'));
        $code = trim((string) $this->input->getOption('code'));

        try {
            $statusFilter = $this->parseStatusFilter((string) $this->input->getOption('status'));
        } catch (InvalidArgumentException $e) {
            $this->error($e->getMessage());
            return self::FAILURE;
        }

        $this->info('Listing sandboxes from the sandbox gateway...');
        $this->line(sprintf(
            'Options: dry_run=%s, code=%s, status=%s, limit=%d, concurrency=%d',
            $dryRun ? 'true' : 'false',
            $code === '' ? 'all' : $code,
            $statusFilter === [] ? self::STATUS_FILTER_ANY : implode(',', $statusFilter),
            $limit,
            $concurrency
        ));
        $startedAt = microtime(true);

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

        // 先把“要重启哪些、跳过哪些”全部算完：动手前就能看到目标数，长任务也才有分母。
        // 沙箱 → 话题 → 龙虾：网关只认识 pod，归属关系仍然要回业务表确认。
        $topicBySandboxId = $this->resolveTopicsBySandboxId($sandboxes);
        $clawByProjectId = $this->resolveClawsByProjectId($topicBySandboxId);

        $targets = [];
        $skippedByReason = [];
        // 按话题聚合：同一话题可能同时存在多个 pod（话题表里的 sandbox_id 与实际 pod 漂移过），
        // 只按“第一个”处理会把其余的留成孤儿，所以这里把该话题名下所有在跑的 pod 都收进来。
        foreach ($sandboxes as $sandbox) {
            $sandboxId = (string) $sandbox['sandbox_id'];
            $status = (string) $sandbox['status'];

            $topic = $topicBySandboxId[$sandboxId] ?? null;
            if ($topic === null) {
                $skippedByReason['no topic matches this sandbox'][] = ['sandbox_id' => $sandboxId, 'status' => $status];
                continue;
            }

            $claw = $clawByProjectId[$topic->getProjectId()] ?? null;
            if ($claw === null) {
                $skippedByReason['project is not a Magic Claw'][] = ['sandbox_id' => $sandboxId, 'status' => $status];
                continue;
            }

            // --code 是精确过滤，其它龙虾静默跳过（与旧行为一致，不计入统计）。
            if ($code !== '' && $claw->getCode() !== $code) {
                continue;
            }

            $topicId = $topic->getId();
            if (! isset($targets[$topicId])) {
                $targets[$topicId] = ['claw' => $claw, 'topic' => $topic, 'sandboxes' => []];
            }
            $targets[$topicId]['sandboxes'][] = $sandbox;
        }

        $targets = array_values($targets);
        $duplicateCount = 0;
        foreach ($targets as $target) {
            if (count($target['sandboxes']) > 1) {
                ++$duplicateCount;
            }
        }

        $skippedCount = 0;
        foreach ($skippedByReason as $entries) {
            $skippedCount += count($entries);
        }

        $eligibleCount = count($targets);

        if ($limit > 0) {
            $targets = array_slice($targets, 0, $limit);
        }

        $stats = [
            'listed' => count($sandboxes),
            'matched' => count($targets),
            'duplicates' => $duplicateCount,
            'deleted' => 0,
            'restarted' => 0,
            'skipped' => $skippedCount,
            'failed' => 0,
        ];

        $this->printPlan($sandboxes, $statusCounts, $targets, $eligibleCount, $skippedByReason, $statusFilter, $dryRun);

        if ($code !== '' && $targets === []) {
            $this->line(sprintf(
                '[NOT_FOUND] No running Magic Claw sandbox for code: %s (status=%s)',
                $code,
                $statusFilter === [] ? self::STATUS_FILTER_ANY : implode(',', $statusFilter)
            ));
        }

        if ($dryRun || $targets === []) {
            $this->printSummary($stats, $statusCounts, $statusFilter, microtime(true) - $startedAt);
            return self::SUCCESS;
        }

        $total = count($targets);
        $effectiveConcurrency = min($concurrency, $total);
        // 协程运行时才谈得上并发；没有协程（本地/单测）就老实串行，避免静默假并发。
        $runInParallel = $effectiveConcurrency > 1 && $this->canRunInParallel();
        $this->line(sprintf(
            'Restarting %d sandbox(es), oldest first, concurrency=%d%s...',
            $total,
            $effectiveConcurrency,
            $effectiveConcurrency > 1 && ! $runInParallel ? ' (coroutine runtime unavailable, running sequentially)' : ''
        ));

        $this->lastProgressAt = 0.0;
        $this->completedTargets = 0;
        $this->deletedSandboxes = 0;
        $this->restartedSandboxes = 0;
        $this->failedSandboxes = 0;
        $progressStartedAt = microtime(true);

        if ($runInParallel) {
            $parallel = new Parallel($effectiveConcurrency);
            foreach ($targets as $index => $target) {
                $parallel->add(
                    fn (): null => $this->restartTarget($index + 1, $total, $target, $progressStartedAt),
                    $index
                );
            }
            $parallel->wait(false);
        } else {
            foreach ($targets as $index => $target) {
                $this->restartTarget($index + 1, $total, $target, $progressStartedAt);
            }
        }

        $stats['deleted'] = $this->deletedSandboxes;
        $stats['restarted'] = $this->restartedSandboxes;
        $stats['failed'] = $this->failedSandboxes;

        $this->printSummary($stats, $statusCounts, $statusFilter, microtime(true) - $startedAt);
        return self::SUCCESS;
    }

    /**
     * 当前进程是否具备协程运行时（没有就只能串行，避免"假并发"）。
     */
    protected function canRunInParallel(): bool
    {
        return Coroutine::inCoroutine();
    }

    /**
     * 重启沙箱：以话题归属者身份发起，restartSandbox 会校验话题归属，用话题 owner 才能通过。
     */
    protected function restartSandbox(TopicEntity $topic): string
    {
        return $this->agentAppService->restartSandbox($this->createDataIsolation($topic), $topic->getId());
    }

    /**
     * 处理一个目标：删掉清单里该话题名下所有在跑的 pod，再重建一个。
     *
     * 并发模式下这个方法会在各自协程里跑；所有输出都用 [序号/总数] 前缀，便于在交错日志里对上号。
     *
     * @param array{claw: MagicClawEntity, topic: TopicEntity, sandboxes: array<int, array{sandbox_id: string, status: string, project_id: string, topic_id: string, warm_pool: bool, bound: bool, created_at: string}>} $target
     */
    private function restartTarget(int $ordinal, int $total, array $target, float $progressStartedAt): void
    {
        $claw = $target['claw'];
        $topic = $target['topic'];
        /** @var array<int, array{sandbox_id: string, status: string, project_id: string, topic_id: string, warm_pool: bool, bound: bool, created_at: string}> $staleSandboxes */
        $staleSandboxes = $target['sandboxes'];
        $sandboxIds = array_column($staleSandboxes, 'sandbox_id');
        $oldestSandbox = $staleSandboxes[0];

        $this->line(sprintf(
            '[%d/%d] restarting code=%s, topic_id=%d, running_sandbox(es)=%d (%s)',
            $ordinal,
            $total,
            $claw->getCode(),
            $topic->getId(),
            count($sandboxIds),
            implode(', ', array_map(
                static fn (array $sandbox): string => sprintf('%s@%s', $sandbox['sandbox_id'], $sandbox['created_at'] === '' ? 'unknown' : $sandbox['created_at']),
                $staleSandboxes
            ))
        ));

        $attemptStartedAt = microtime(true);
        try {
            // 关键：删“清单里看到的”全部 pod，而不是话题表里记的那一个。
            // 表里的 sandbox_id 与实际 pod 漂移过时（线上出现过同一龙虾两个 pod），
            // 只删表里那个会把真正在跑的 pod 留成孤儿。
            foreach ($sandboxIds as $sandboxIdToDelete) {
                try {
                    $this->agentAppService->stopSandbox((string) $sandboxIdToDelete);
                    ++$this->deletedSandboxes;
                    $this->line(sprintf('  [DELETE] code=%s, sandbox_id=%s', $claw->getCode(), $sandboxIdToDelete));
                    $this->logger->info('Stale Magic Claw sandbox deleted before restart', [
                        'code' => $claw->getCode(),
                        'topic_id' => $topic->getId(),
                        'sandbox_id' => $sandboxIdToDelete,
                    ]);
                } catch (Throwable $deleteError) {
                    // 删不掉不能阻断重建，但必须显式报出来，否则又会留下重复 pod。
                    $this->error(sprintf(
                        '  [DELETE_FAIL] code=%s, sandbox_id=%s, error=%s',
                        $claw->getCode(),
                        $sandboxIdToDelete,
                        $deleteError->getMessage()
                    ));
                    $this->logger->error('Failed to delete stale Magic Claw sandbox before restart', [
                        'code' => $claw->getCode(),
                        'topic_id' => $topic->getId(),
                        'sandbox_id' => $sandboxIdToDelete,
                        'exception' => get_class($deleteError),
                        'error' => $deleteError->getMessage(),
                    ]);
                }
            }

            $restartedSandboxId = $this->restartSandbox($topic);
            $duration = microtime(true) - $attemptStartedAt;
            ++$this->restartedSandboxes;
            $this->info(sprintf(
                '[%d/%d] [OK] code=%s, new_sandbox_id=%s, took %s',
                $ordinal,
                $total,
                $claw->getCode(),
                $restartedSandboxId,
                self::formatDuration($duration)
            ));
            $this->logger->info('Magic Claw sandbox restarted', [
                'code' => $claw->getCode(),
                'user_id' => $topic->getUserId(),
                'organization_code' => $topic->getUserOrganizationCode(),
                'project_id' => $topic->getProjectId(),
                'topic_id' => $topic->getId(),
                'previous_sandbox_ids' => $sandboxIds,
                'previous_sandbox_created_at' => $oldestSandbox['created_at'],
                'sandbox_id' => $restartedSandboxId,
                'duration_seconds' => round($duration, 3),
            ]);
        } catch (Throwable $e) {
            ++$this->failedSandboxes;
            $this->error(sprintf(
                '[%d/%d] [FAIL] code=%s, topic_id=%d, sandbox_ids=%s, error=%s',
                $ordinal,
                $total,
                $claw->getCode(),
                $topic->getId(),
                implode(',', $sandboxIds),
                $e->getMessage()
            ));
            $this->logger->error('Failed to restart Magic Claw sandbox', [
                'code' => $claw->getCode(),
                'user_id' => $topic->getUserId(),
                'organization_code' => $topic->getUserOrganizationCode(),
                'project_id' => $topic->getProjectId(),
                'topic_id' => $topic->getId(),
                'sandbox_ids' => $sandboxIds,
                'exception' => get_class($e),
                'error' => $e->getMessage(),
            ]);
        }

        ++$this->completedTargets;
        $this->printProgress($total, $progressStartedAt);
    }

    /**
     * 动手前把“清单多大、要重启几个、为什么跳过”一次打清楚。
     *
     * @param array<int, array{sandbox_id: string, status: string, project_id: string, topic_id: string, warm_pool: bool, bound: bool, created_at: string}> $sandboxes
     * @param array<string, int> $statusCounts
     * @param array<int, array{claw: MagicClawEntity, topic: TopicEntity, sandboxes: array<int, array{sandbox_id: string, status: string, project_id: string, topic_id: string, warm_pool: bool, bound: bool, created_at: string}>}> $targets
     * @param array<string, array<int, array{sandbox_id: string, status: string}>> $skippedByReason
     * @param string[] $statusFilter
     */
    private function printPlan(
        array $sandboxes,
        array $statusCounts,
        array $targets,
        int $eligibleCount,
        array $skippedByReason,
        array $statusFilter,
        bool $dryRun,
    ): void {
        $this->line(sprintf(
            'Sandbox list: %d (status_filter=%s%s)',
            count($sandboxes),
            $statusFilter === [] ? self::STATUS_FILTER_ANY . ' (disabled)' : implode(',', $statusFilter),
            $statusCounts === [] ? '' : ', statuses: ' . self::formatStatusCounts($statusCounts)
        ));

        if ($eligibleCount > count($targets)) {
            // 有 --limit 时必须说清总数，否则看起来像“只有这么几只龙虾在跑”（limit 值见顶部 Options 行）。
            $this->line(sprintf(
                'Targets: %d of %d eligible Magic Claw sandbox(es) to restart, oldest first (limited)',
                count($targets),
                $eligibleCount
            ));
        } else {
            $this->line(sprintf('Targets: %d Magic Claw sandbox(es) to restart, oldest first', count($targets)));
        }

        // 同一个话题下有多个 pod = 话题表 sandbox_id 与实际 pod 漂移过，重启前必须都清掉。
        foreach ($targets as $target) {
            if (count($target['sandboxes']) < 2) {
                continue;
            }
            $this->line(sprintf(
                '[DUPLICATE] code=%s, topic_id=%d 有 %d 个在跑的沙箱：%s',
                $target['claw']->getCode(),
                $target['topic']->getId(),
                count($target['sandboxes']),
                implode(', ', array_map(
                    static fn (array $sandbox): string => sprintf('%s@%s', $sandbox['sandbox_id'], $sandbox['created_at'] === '' ? 'unknown' : $sandbox['created_at']),
                    $target['sandboxes']
                ))
            ));
        }

        if ($skippedByReason !== []) {
            $this->line('Skipped: ' . self::formatSkipReasons($skippedByReason));
        }

        if ($dryRun) {
            foreach ($targets as $index => $target) {
                $this->line(sprintf(
                    '[TARGET] %d/%d code=%s, topic_id=%d, project_id=%d, deletes=%s, recreates=1',
                    $index + 1,
                    count($targets),
                    $target['claw']->getCode(),
                    $target['topic']->getId(),
                    $target['topic']->getProjectId(),
                    implode(', ', array_map(
                        static fn (array $sandbox): string => sprintf('%s@%s', $sandbox['sandbox_id'], $sandbox['created_at'] === '' ? 'unknown' : $sandbox['created_at']),
                        $target['sandboxes']
                    ))
                ));
            }
            return;
        }

        // 逐条明细只在 -v 下打印，否则几十上百行 SKIP 会把进度淹没。
        if (! $this->output->isVerbose()) {
            return;
        }

        foreach ($skippedByReason as $reason => $entries) {
            foreach ($entries as $entry) {
                $this->line(sprintf(
                    '[SKIP] sandbox_id=%s, status=%s, reason=%s',
                    $entry['sandbox_id'],
                    $entry['status'] === '' ? 'unknown' : $entry['status'],
                    $reason
                ));
            }
        }
    }

    /**
     * 长任务心跳：每完成 PROGRESS_EVERY 个目标，或距上次打印超过 PROGRESS_INTERVAL_SECONDS 就打一行，
     * 带已完成数、耗时和 ETA。并发模式下按“已完成数”计数，不再看处理顺序。
     */
    private function printProgress(int $total, float $startedAt): void
    {
        $done = $this->completedTargets;
        if ($done >= $total) {
            return;
        }

        $elapsed = microtime(true) - $startedAt;
        if ($done % self::PROGRESS_EVERY !== 0 && $elapsed - $this->lastProgressAt < self::PROGRESS_INTERVAL_SECONDS) {
            return;
        }
        $this->lastProgressAt = $elapsed;

        $remaining = $total - $done;
        $averageSeconds = $done > 0 ? $elapsed / $done : 0.0;

        $this->line(sprintf(
            '  progress: %d/%d done (restarted=%d, failed=%d), elapsed %s, eta ~%s',
            $done,
            $total,
            $this->restartedSandboxes,
            $this->failedSandboxes,
            self::formatDuration($elapsed),
            self::formatDuration($averageSeconds * $remaining)
        ));
    }

    /**
     * @param array<string, int> $statusCounts
     */
    private static function formatStatusCounts(array $statusCounts): string
    {
        arsort($statusCounts);
        $parts = [];
        foreach ($statusCounts as $status => $count) {
            $parts[] = $status . '=' . $count;
        }

        return implode(', ', $parts);
    }

    /**
     * 按原因聚合跳过项，并给每个原因附两个示例 sandbox_id，便于定位“为什么没重启我那只”。
     *
     * @param array<string, array<int, array{sandbox_id: string, status: string}>> $skippedByReason
     */
    private static function formatSkipReasons(array $skippedByReason): string
    {
        arsort($skippedByReason);

        $parts = [];
        foreach ($skippedByReason as $reason => $entries) {
            $examples = array_slice(array_column($entries, 'sandbox_id'), 0, 2);
            $parts[] = sprintf(
                '%s=%d (e.g. %s)',
                $reason,
                count($entries),
                implode(', ', $examples)
            );
        }

        return implode('; ', $parts);
    }

    private static function formatDuration(float $seconds): string
    {
        if ($seconds < 1) {
            return sprintf('%dms', (int) round($seconds * 1000));
        }
        if ($seconds < 60) {
            return sprintf('%.1fs', $seconds);
        }

        return sprintf('%dm%02ds', (int) floor($seconds / 60), (int) round(fmod($seconds, 60)));
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
     * @param array{listed: int, matched: int, duplicates: int, deleted: int, restarted: int, skipped: int, failed: int} $stats
     * @param array<string, int> $statusCounts
     * @param string[] $statusFilter
     */
    private function printSummary(array $stats, array $statusCounts = [], array $statusFilter = [], float $elapsed = 0.0): void
    {
        $this->line('');
        $this->info('Magic Claw sandbox restart summary:');
        $this->line('  status_filter: ' . ($statusFilter === [] ? self::STATUS_FILTER_ANY . ' (disabled)' : implode(',', $statusFilter)));
        $this->line('  listed: ' . $stats['listed']);
        $this->line('  matched: ' . $stats['matched']);
        $this->line('  duplicates: ' . $stats['duplicates']);
        $this->line('  deleted: ' . $stats['deleted']);
        $this->line('  restarted: ' . $stats['restarted']);
        $this->line('  skipped: ' . $stats['skipped']);
        $this->line('  failed: ' . $stats['failed']);
        $this->line('  elapsed: ' . self::formatDuration($elapsed));

        if ($statusCounts !== []) {
            $this->line('  sandbox_statuses: ' . self::formatStatusCounts($statusCounts));
        }

        $this->logger->info('Magic Claw sandbox restart command finished', $stats + [
            'status_filter' => $statusFilter === [] ? self::STATUS_FILTER_ANY : $statusFilter,
            'status_counts' => $statusCounts,
            'elapsed_seconds' => round($elapsed, 3),
        ]);
    }
}
