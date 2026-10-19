<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Agent\Service;

use App\Domain\SuperMagic\Agent\Repository\Facade\MagicClawRepositoryInterface;
use App\Domain\SuperMagic\Agent\Repository\Persistence\MagicClawReconciliationRepository;
use App\Domain\SuperMagic\Agent\Service\MagicClawRuntimePolicyDomainService;
use App\Domain\SuperMagic\Task\Entity\ValueObject\TaskStatus;
use App\Domain\SuperMagic\Task\Service\AgentDomainService;
use App\Domain\SuperMagic\Task\Service\TaskDomainService;
use App\ErrorCode\PermissionErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\Traits\HasLogger;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Exception\SandboxOperationException;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\Constant\ResponseCode;
use App\Infrastructure\SuperMagic\Task\Locker\SandboxLifecycleLock;
use App\Infrastructure\Util\Locker\LockerInterface;
use Hyperf\DbConnection\Db;
use Psr\SimpleCache\CacheInterface;
use RuntimeException;
use Throwable;

class MagicClawReconciliationAppService
{
    use HasLogger;

    public function __construct(
        private readonly MagicClawReconciliationRepository $repository,
        private readonly MagicClawRepositoryInterface $claws,
        private readonly MagicClawRuntimePolicyDomainService $policy,
        private readonly AgentDomainService $agent,
        private readonly TaskDomainService $tasks,
        private readonly SandboxLifecycleLock $lifecycle,
        private readonly LockerInterface $locker,
        private readonly CacheInterface $cache,
    ) {
    }

    /** The policy write and durable work record commit together. No network I/O in this transaction. */
    public function savePolicy(string $organization, string $actor, callable $save): mixed
    {
        return $this->withOrganizationLock($organization, fn () => Db::transaction(function () use ($organization, $actor, $save) {
            $result = $save();
            $this->repository->create($organization, $actor, 'policy_changed');
            return $result;
        }));
    }

    public function status(string $organization): ?array
    {
        $operation = $this->repository->latest($organization);
        return $operation === null ? null : $this->repository->summarize($operation);
    }

    /** Read-only inventory for an explicitly selected organization; never infer sandbox IDs. */
    public function preview(string $organization): iterable
    {
        $cursor = 0;
        do {
            $rows = $this->repository->claws($organization, $cursor);
            foreach ($rows as $claw) {
                $cursor = (int) $claw['id'];
                if ($this->policy->isAllowed($organization, $claw['user_id'])) {
                    continue;
                }
                $resources = 0;
                foreach ($this->repository->topics($claw) as $topic) {
                    ++$resources;
                    yield ['claw_id' => (string) $claw['id'], 'user_id' => $claw['user_id'], 'topic_id' => (string) $topic['id'], 'sandbox_id' => (string) ($topic['sandbox_id'] ?? '')];
                }
                if ($resources === 0 || ! empty($claw['file_converter_sandbox_id'])) {
                    yield ['claw_id' => (string) $claw['id'], 'user_id' => $claw['user_id'], 'topic_id' => '0', 'sandbox_id' => (string) ($claw['file_converter_sandbox_id'] ?? '')];
                }
            }
        } while (count($rows) === 100);
    }

    public function retry(string $organization, string $operationId): array
    {
        return $this->withOrganizationLock($organization, function () use ($organization, $operationId): array {
            $operation = $this->repository->latest($organization);
            if ($operation === null || (string) $operation['id'] !== $operationId) {
                ExceptionBuilder::throw(PermissionErrorCode::ValidateFailed, 'permission.magic_claw_reconciliation_stale');
            }
            if ($operation['status'] !== 'completed') {
                $this->repository->retry($operation);
            }
            return $this->status($organization) ?? [];
        });
    }

    public function execute(int $itemLimit = 5): void
    {
        // Bounded pages and work batches; a slow gateway does not monopolize subsequent organizations.
        foreach ($this->repository->activeOperations(5) as $operation) {
            $owner = bin2hex(random_bytes(16));
            if (! $this->repository->claim($operation, $owner)) {
                continue;
            }
            try {
                $this->scan($operation);
                $deadline = microtime(true) + 20;
                for ($processed = 0; $processed < max(1, min($itemLimit, 20)); ++$processed) {
                    if (microtime(true) >= $deadline || ! $this->repository->isCurrent($operation)
                        || ! ($item = $this->repository->dueItem($operation))) {
                        break;
                    }
                    $this->stopItem($operation, $item);
                }
                $fresh = $this->repository->latest($operation['organization_code']);
                if ($fresh !== null && (string) $fresh['id'] === (string) $operation['id']) {
                    $this->repository->updateOperation($fresh, ['status' => $this->repository->summarize($fresh)['status']]);
                }
            } catch (Throwable $exception) {
                $this->logger->error('龙虾权限停机处理失败', ['operation_id' => (string) $operation['id'], 'exception' => $exception->getMessage()]);
            } finally {
                $this->repository->release($operation, $owner);
            }
        }
    }

    /** Also covers department syncs and previously missed revocations, without scanning all users. */
    public function discover(): void
    {
        $cursorKey = 'magic_claw_permission_discovery_cursor';
        $rows = $this->repository->discoveryPage((int) $this->cache->get($cursorKey, 0));
        foreach ($rows as $claw) {
            if (! $this->policy->isAllowed($claw['organization_code'], $claw['user_id'])) {
                $hasBinding = false;
                foreach ($this->repository->topics($claw) as $topic) {
                    if (! empty($topic['sandbox_id'])) {
                        $hasBinding = true;
                        break;
                    }
                }
                if ($claw['runtime_block_reason'] === '' || $hasBinding || ! empty($claw['file_converter_sandbox_id'])) {
                    $this->requestReconciliation($claw['organization_code'], 'membership_check');
                }
            }
            $this->cache->set($cursorKey, (string) $claw['id']);
        }
        if (count($rows) < 100) {
            $this->cache->set($cursorKey, '0');
        }
    }

    public function requestReconciliation(string $organization, string $reason, bool $force = false): void
    {
        $this->withOrganizationLock($organization, function () use ($organization, $reason, $force): void {
            $latest = $this->repository->latest($organization);
            if (! $force && $latest !== null && in_array($latest['status'], ['pending', 'running', 'partial_failed'], true)) {
                return;
            }
            Db::transaction(fn () => $this->repository->create($organization, '', $reason));
        });
    }

    private function scan(array $operation): void
    {
        if ($operation['scan_completed'] || ! $this->repository->isCurrent($operation)) {
            return;
        }
        $claws = $this->repository->claws($operation['organization_code'], (int) $operation['cursor']);
        foreach ($claws as $claw) {
            if (! $this->policy->isAllowed($claw['organization_code'], $claw['user_id'])) {
                foreach ($this->repository->topics($claw) as $topic) {
                    $this->repository->enqueue($operation, $claw, $topic);
                }
                // The auxiliary resource also represents claws with no topic yet.
                $this->repository->enqueue($operation, $claw, ['id' => 0, 'sandbox_id' => $claw['file_converter_sandbox_id'] ?? '']);
            }
            $this->repository->updateOperation($operation, ['cursor' => $claw['id']]);
        }
        if (count($claws) < 100) {
            $this->repository->updateOperation($operation, ['scan_completed' => true]);
        }
    }

    private function stopItem(array $operation, array $item): void
    {
        try {
            $resource = $this->repository->claw((int) $item['claw_id']);
            if ($resource === null) {
                throw new RuntimeException('resource_identity_mismatch');
            }
            $lockId = (int) $item['topic_id'] ?: -((int) $resource['project_id']);
            $this->lifecycle->run($lockId, function (callable $assertOwnership) use ($operation, $item): void {
                $assertOwnership();
                if (! $this->repository->isCurrent($operation)) {
                    return;
                }
                $claw = $this->repository->claw((int) $item['claw_id']);
                $topic = (int) $item['topic_id'] > 0 ? $this->repository->topic((int) $item['topic_id']) : null;
                if ($claw === null || $claw['organization_code'] !== $operation['organization_code']
                    || ((int) $item['topic_id'] > 0 && ($topic === null
                        || $topic['user_organization_code'] !== $claw['organization_code']
                        || $topic['user_id'] !== $claw['user_id'] || (string) $topic['project_id'] !== (string) $claw['project_id']))) {
                    throw new RuntimeException('resource_identity_mismatch');
                }
                $shouldStop = $this->withOrganizationLock($claw['organization_code'], function () use ($operation, $item, $claw): bool {
                    if (! $this->repository->isCurrent($operation)) {
                        return false;
                    }
                    if ($this->policy->isAllowed($claw['organization_code'], $claw['user_id'])) {
                        $this->repository->updateItem($item, ['status' => 'skipped', 'last_error' => '']);
                        return false;
                    }
                    $this->claws->setRuntimeBlock((int) $claw['id'], (string) $operation['id']);
                    return true;
                });
                if (! $shouldStop) {
                    return;
                }
                // Cancel queued work even when stopping the pod times out, so it cannot replay after reauthorization.
                if ($topic !== null) {
                    $this->repository->cancelQueuedMessages($topic);
                }
                // Resolve again under the initialization lock; never delete an ID guessed from topic_id.
                $sandboxId = (string) ($topic !== null ? ($topic['sandbox_id'] ?? '') : ($claw['file_converter_sandbox_id'] ?? ''));
                $this->repository->updateItem($item, ['sandbox_id' => $sandboxId]);
                $assertOwnership();
                if ($sandboxId !== '') {
                    try {
                        $this->agent->stopSandbox($sandboxId);
                    } catch (SandboxOperationException $exception) {
                        if (! ResponseCode::isNotFound($exception->getCode())) {
                            throw $exception;
                        }
                    }
                }
                $assertOwnership();
                if ($topic !== null) {
                    $this->tasks->updateTaskStatusByTopicIds([(int) $topic['id']], TaskStatus::Stopped, 'Magic Claw access revoked', true);
                    $this->repository->clearBinding((int) $topic['id'], $sandboxId);
                } else {
                    $this->claws->clearFileConverterSandbox((int) $claw['id'], $sandboxId);
                }
                $this->repository->updateItem($item, ['status' => 'stopped', 'last_error' => '']);
            });
        } catch (Throwable $exception) {
            $attempts = (int) $item['attempts'] + 1;
            $delay = [10, 30, 60][min($attempts - 1, 2)];
            $this->repository->updateItem($item, [
                'status' => 'failed', 'attempts' => $attempts, 'next_retry_at' => time() + ($attempts > 3 ? 300 : $delay),
                // Do not return provider URLs, tokens or raw exception messages to administrators.
                'last_error' => 'sandbox_stop_unconfirmed',
            ]);
            $this->logger->warning('龙虾沙箱停止未确认，将重试', ['operation_id' => (string) $operation['id'], 'topic_id' => (string) $item['topic_id'], 'exception' => $exception->getMessage()]);
        }
    }

    private function withOrganizationLock(string $organization, callable $callback): mixed
    {
        $name = 'claw_permission_policy:' . $organization;
        $owner = bin2hex(random_bytes(16));
        if (! $this->locker->spinLock($name, $owner, 60, 10)) {
            ExceptionBuilder::throw(PermissionErrorCode::BusinessException, 'permission.magic_claw_reconciliation_busy');
        }
        try {
            return $callback();
        } finally {
            $this->locker->release($name, $owner);
        }
    }
}
