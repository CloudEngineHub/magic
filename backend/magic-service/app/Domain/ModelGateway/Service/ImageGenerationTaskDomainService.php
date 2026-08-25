<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\ModelGateway\Service;

use App\Domain\ModelGateway\Entity\Dto\TextGenerateImageDTO;
use App\Domain\ModelGateway\Entity\ImageGenerationTaskEntity;
use App\Domain\ModelGateway\Entity\ValueObject\Code;
use App\Domain\ModelGateway\Entity\ValueObject\ImageGenerationTaskStatus;
use App\Domain\ModelGateway\Entity\ValueObject\ModelGatewayDataIsolation;
use App\Domain\ModelGateway\Repository\ImageGenerationTaskRepositoryInterface;
use App\ErrorCode\MagicApiErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;

readonly class ImageGenerationTaskDomainService
{
    private const int TASK_TIMEOUT_SECONDS = 720;

    public function __construct(
        private ImageGenerationTaskRepositoryInterface $repository,
        private ImageGenerationPayloadSanitizer $payloadSanitizer,
    ) {
    }

    public function createTask(
        ModelGatewayDataIsolation $dataIsolation,
        TextGenerateImageDTO $requestDTO,
        array $requestPayload,
    ): ImageGenerationTaskEntity {
        $now = date('Y-m-d H:i:s');
        $task = new ImageGenerationTaskEntity(
            id: $this->createTaskId(),
            organizationCode: $dataIsolation->getCurrentOrganizationCode(),
            userId: $dataIsolation->getCurrentUserId(),
            accessTokenId: (string) $dataIsolation->getAccessToken()->getId(),
            environment: $dataIsolation->getEnvironment(),
            model: $requestDTO->getModel(),
            requestPayload: $this->sanitizeRequestPayload($requestPayload),
            status: ImageGenerationTaskStatus::RUNNING,
            createdAt: $now,
            startedAt: $now,
            updatedAt: $now,
        );

        $this->repository->save($task);
        return $task;
    }

    public function getOwnedTask(ModelGatewayDataIsolation $dataIsolation, string $taskId): ImageGenerationTaskEntity
    {
        $task = $this->repository->getById($taskId);
        if (
            ! $task instanceof ImageGenerationTaskEntity
            || $task->getOrganizationCode() !== $dataIsolation->getCurrentOrganizationCode()
            || $task->getUserId() !== $dataIsolation->getCurrentUserId()
            || $task->getEnvironment() !== $dataIsolation->getEnvironment()
        ) {
            ExceptionBuilder::throw(MagicApiErrorCode::ValidateFailed, 'image generation task not found');
        }

        return $task;
    }

    public function finishSucceeded(ImageGenerationTaskEntity $task, array $responsePayload): void
    {
        $task->markSucceeded($this->payloadSanitizer->sanitize($responsePayload));
        $this->repository->save($task);
    }

    public function finishFailed(ImageGenerationTaskEntity $task, null|int|string $errorCode, string $errorMessage): void
    {
        $task->markFailed($errorCode, $errorMessage);
        $this->repository->save($task);
    }

    public function markTimedOutIfNeeded(ImageGenerationTaskEntity $task): bool
    {
        if (! $task->markTimedOutIfRunning(self::TASK_TIMEOUT_SECONDS)) {
            return false;
        }

        $this->repository->save($task);
        return true;
    }

    private function createTaskId(): string
    {
        return Code::ImageGenerationTask->gen();
    }

    private function sanitizeRequestPayload(array $requestPayload): array
    {
        unset($requestPayload['api_key']);
        return $this->payloadSanitizer->sanitize($requestPayload);
    }
}
