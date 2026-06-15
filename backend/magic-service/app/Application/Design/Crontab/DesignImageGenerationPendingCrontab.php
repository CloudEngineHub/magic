<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Design\Crontab;

use App\Domain\Design\Entity\ValueObject\ImageGenerationType;
use App\Domain\Design\Event\ImageGenerationTaskCreatedEvent;
use App\Domain\Design\Service\ImageGenerationDomainService;
use Dtyq\AsyncEvent\AsyncEventUtil;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Crontab\Annotation\Crontab;
use Psr\Log\LoggerInterface;
use Throwable;

#[Crontab(
    rule: '* * * * *',
    name: 'DesignImageGenerationPendingCrontab',
    singleton: true,
    onOneServer: true,
    mutexExpires: 55,
    callback: 'execute',
    memo: '恢复设计擦除/扩图 pending 任务'
)]
readonly class DesignImageGenerationPendingCrontab
{
    public function __construct(
        private ImageGenerationDomainService $imageGenerationDomainService,
        private ConfigInterface $config,
        private LoggerInterface $logger,
    ) {
    }

    public function execute(): void
    {
        try {
            $limit = (int) $this->config->get('design_image_operation.pending_scan_limit', 20);
            $tasks = $this->imageGenerationDomainService->findPendingByTypes([
                ImageGenerationType::ERASER,
                ImageGenerationType::EXPAND,
            ], $limit);

            foreach ($tasks as $task) {
                AsyncEventUtil::dispatch(new ImageGenerationTaskCreatedEvent($task));
            }
        } catch (Throwable $throwable) {
            $this->logger->error('design image generation pending crontab failed', [
                'error' => $throwable->getMessage(),
                'trace' => $throwable->getTraceAsString(),
            ]);
        }
    }
}
