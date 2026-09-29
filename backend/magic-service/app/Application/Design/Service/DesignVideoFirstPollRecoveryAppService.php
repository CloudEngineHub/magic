<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Design\Service;

use App\Application\Design\Event\Message\DesignVideoPollMessage;
use App\Application\Design\Event\Message\DesignVideoSubmitMessage;
use App\Application\Design\Event\Publish\DesignVideoPollDelayPublisher;
use App\Application\Design\Event\Publish\DesignVideoSubmitPublisher;
use App\Domain\Design\Entity\DesignDataIsolation;
use App\Domain\Design\Entity\DesignGenerationTaskEntity;
use App\Domain\Design\Service\DesignGenerationTaskDomainService;
use Hyperf\Amqp\Producer;
use Psr\Log\LoggerInterface;
use Throwable;

use function Hyperf\Translation\trans;

class DesignVideoFirstPollRecoveryAppService
{
    private const int BATCH_SIZE = 100;

    private const int MAX_BATCHES_PER_RUN = 10;

    /**
     * 非画布任务的提交在 create() 中同步完成，进程中断会让它停在空 operation_id。
     * 给足宽限期避免误判仍在提交中的任务，超期后收敛为失败。
     */
    private const int SUBMIT_INTERRUPT_GRACE_SECONDS = 600;

    public function __construct(
        private readonly DesignGenerationTaskDomainService $domainService,
        private readonly Producer $producer,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function recover(): void
    {
        // 倒序扫描：首轮轮询恢复只关心刚创建的任务，它们 id 最大，
        // 倒序能保证它们永远落在扫描窗口内，不会被历史运行中任务挤占后饿死。
        $cursorId = PHP_INT_MAX;

        for ($batchIndex = 0; $batchIndex < self::MAX_BATCHES_PER_RUN; ++$batchIndex) {
            $tasks = $this->domainService->findProcessingTasksBeforeId($cursorId, self::BATCH_SIZE);
            if ($tasks === []) {
                return;
            }

            foreach ($tasks as $task) {
                $cursorId = min($cursorId, (int) ($task->getId() ?? 0));

                $dataIsolation = DesignDataIsolation::create(
                    $task->getOrganizationCode(),
                    $task->getUserId()
                );

                if ($this->isSubmitPending($task)) {
                    $this->handleInterruptedSubmit($dataIsolation, $task);
                    continue;
                }

                if (! $this->shouldRecoverFirstPoll($task)) {
                    continue;
                }

                try {
                    $this->producer->produce($this->buildRecoveryPublisher($task));
                    $this->domainService->markFirstPollSent($dataIsolation, $task);
                } catch (Throwable $throwable) {
                    $this->domainService->markFirstPollDispatchFailed(
                        $dataIsolation,
                        $task,
                        $throwable->getMessage(),
                        $this->buildNextRetryAt()
                    );
                    $this->logger->error('design video first poll recovery failed', [
                        'generation_id' => $task->getGenerationId(),
                        'project_id' => $task->getProjectId(),
                        'organization_code' => $task->getOrganizationCode(),
                        'error' => $throwable->getMessage(),
                    ]);
                }
            }

            if (count($tasks) < self::BATCH_SIZE) {
                return;
            }
        }
    }

    private function shouldRecoverFirstPoll(DesignGenerationTaskEntity $task): bool
    {
        if ($task->getLastPolledAt() !== null) {
            return false;
        }

        if (! in_array($task->getFirstPollStatus(), ['pending', 'failed'], true)) {
            return false;
        }

        $deadlineAt = $task->getPollDeadlineAt();
        if ($deadlineAt !== null && strtotime($deadlineAt) !== false && time() > strtotime($deadlineAt)) {
            return false;
        }

        $nextRetryAt = $task->getFirstPollNextRetryAt();
        if ($nextRetryAt === null) {
            return true;
        }

        $nextRetryTimestamp = strtotime($nextRetryAt);
        if ($nextRetryTimestamp === false) {
            return true;
        }

        return $nextRetryTimestamp <= time();
    }

    /**
     * 非画布任务必须先完成上游提交，空 operation_id 意味着提交还没走完（宽限期内）。
     */
    private function isSubmitPending(DesignGenerationTaskEntity $task): bool
    {
        return ! $task->isCanvasComposition() && $task->getOperationId() === '';
    }

    /**
     * 收敛"提交过程中断"的任务。
     *
     * 提交失败时 create() 会删除任务，所以长时间停在空 operation_id 只可能是进程中断；
     * 这类任务不会再有消息推动，必须显式置为失败，否则会永远停在 pending 并被每分钟重复扫到。
     */
    private function handleInterruptedSubmit(DesignDataIsolation $dataIsolation, DesignGenerationTaskEntity $task): void
    {
        $ageSeconds = time() - $task->getUpdatedAt()->getTimestamp();
        if ($ageSeconds <= self::SUBMIT_INTERRUPT_GRACE_SECONDS) {
            return;
        }

        $this->logger->error('design video submit interrupted, mark failed', [
            'generation_id' => $task->getGenerationId(),
            'project_id' => $task->getProjectId(),
            'organization_code' => $task->getOrganizationCode(),
            'age_seconds' => $ageSeconds,
        ]);

        $this->domainService->markAsFailed(
            $dataIsolation,
            $task,
            trans('design.video_generation.submit_interrupted')
        );
    }

    /**
     * 根据任务是否已经完成上游提交，选择恢复提交消息或轮询消息。
     */
    private function buildRecoveryPublisher(DesignGenerationTaskEntity $task): DesignVideoPollDelayPublisher|DesignVideoSubmitPublisher
    {
        if ($task->isCanvasComposition() && ! $task->hasOperationId()) {
            return new DesignVideoSubmitPublisher(new DesignVideoSubmitMessage(
                $task->getOrganizationCode(),
                $task->getProjectId(),
                $task->getGenerationId(),
            ));
        }

        return new DesignVideoPollDelayPublisher(new DesignVideoPollMessage(
            $task->getOrganizationCode(),
            $task->getProjectId(),
            $task->getGenerationId(),
        ));
    }

    private function buildNextRetryAt(): string
    {
        return date(DATE_ATOM, time() + 60);
    }
}
