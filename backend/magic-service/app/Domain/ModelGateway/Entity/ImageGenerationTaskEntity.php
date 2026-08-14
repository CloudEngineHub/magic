<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\ModelGateway\Entity;

use App\Domain\ModelGateway\Entity\ValueObject\ImageGenerationTaskStatus;
use DateTimeImmutable;
use DateTimeInterface;

class ImageGenerationTaskEntity
{
    private const string TIMEOUT_ERROR_CODE = 'IMAGE_GENERATION_TIMEOUT';

    private const string TIMEOUT_ERROR_MESSAGE = 'image generation timeout';

    public function __construct(
        private readonly string $id,
        private readonly string $organizationCode,
        private readonly string $userId,
        private readonly string $accessTokenId,
        private readonly string $environment,
        private readonly string $model,
        private readonly array $requestPayload,
        private ImageGenerationTaskStatus $status,
        private array $responsePayload = [],
        private ?string $errorCode = null,
        private ?string $errorMessage = null,
        private string $createdAt = '',
        private string $startedAt = '',
        private ?string $finishedAt = null,
        private string $updatedAt = '',
    ) {
        $now = date('Y-m-d H:i:s');
        $this->createdAt = $this->createdAt ?: $now;
        $this->startedAt = $this->startedAt ?: $this->createdAt;
        $this->updatedAt = $this->updatedAt ?: $this->createdAt;
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function getUserId(): string
    {
        return $this->userId;
    }

    public function getAccessTokenId(): string
    {
        return $this->accessTokenId;
    }

    public function getEnvironment(): string
    {
        return $this->environment;
    }

    public function getModel(): string
    {
        return $this->model;
    }

    public function getRequestPayload(): array
    {
        return $this->requestPayload;
    }

    public function getResponsePayload(): array
    {
        return $this->responsePayload;
    }

    public function getStatus(): ImageGenerationTaskStatus
    {
        return $this->status;
    }

    public function getErrorCode(): ?string
    {
        return $this->errorCode;
    }

    public function getErrorMessage(): ?string
    {
        return $this->errorMessage;
    }

    public function getCreatedAt(): string
    {
        return $this->createdAt;
    }

    public function getStartedAt(): string
    {
        return $this->startedAt;
    }

    public function getFinishedAt(): ?string
    {
        return $this->finishedAt;
    }

    public function getUpdatedAt(): string
    {
        return $this->updatedAt;
    }

    public function markSucceeded(array $responsePayload, ?DateTimeInterface $now = null): void
    {
        if (! $this->status->isRunning()) {
            return;
        }

        $finishedAt = $this->formatTime($now);
        $this->status = ImageGenerationTaskStatus::SUCCEEDED;
        $this->responsePayload = $responsePayload;
        $this->errorCode = null;
        $this->errorMessage = null;
        $this->finishedAt = $finishedAt;
        $this->updatedAt = $finishedAt;
    }

    public function markFailed(null|int|string $errorCode, string $errorMessage, ?DateTimeInterface $now = null): void
    {
        if (! $this->status->isRunning()) {
            return;
        }

        $finishedAt = $this->formatTime($now);
        $this->status = ImageGenerationTaskStatus::FAILED;
        $this->errorCode = $errorCode === null ? null : (string) $errorCode;
        $this->errorMessage = $errorMessage;
        $this->finishedAt = $finishedAt;
        $this->updatedAt = $finishedAt;
    }

    public function markTimedOutIfRunning(int $timeoutSeconds, ?DateTimeInterface $now = null): bool
    {
        if (! $this->status->isRunning()) {
            return false;
        }

        $now ??= new DateTimeImmutable();
        $createdAt = strtotime($this->createdAt);
        if ($createdAt === false || $now->getTimestamp() - $createdAt <= $timeoutSeconds) {
            return false;
        }

        $this->markFailed(self::TIMEOUT_ERROR_CODE, self::TIMEOUT_ERROR_MESSAGE, $now);
        return true;
    }

    public function toPersistenceArray(): array
    {
        return [
            'id' => $this->id,
            'organization_code' => $this->organizationCode,
            'user_id' => $this->userId,
            'access_token_id' => $this->accessTokenId,
            'environment' => $this->environment,
            'model' => $this->model,
            'request_payload' => $this->requestPayload,
            'response_payload' => $this->responsePayload,
            'status' => $this->status->value,
            'error_code' => $this->errorCode,
            'error_message' => $this->errorMessage,
            'created_at' => $this->createdAt,
            'started_at' => $this->startedAt,
            'finished_at' => $this->finishedAt,
            'updated_at' => $this->updatedAt,
        ];
    }

    public function toResponseArray(): array
    {
        return [
            'id' => $this->id,
            'object' => 'image.generation.task',
            'status' => $this->status->value,
            'created_at' => $this->createdAt,
            'updated_at' => $this->updatedAt,
            'finished_at' => $this->finishedAt,
            'response' => $this->status === ImageGenerationTaskStatus::SUCCEEDED ? $this->responsePayload : null,
            'error' => $this->status === ImageGenerationTaskStatus::FAILED ? [
                'code' => $this->errorCode,
                'message' => $this->errorMessage,
            ] : null,
        ];
    }

    private function formatTime(?DateTimeInterface $time): string
    {
        return ($time ?? new DateTimeImmutable())->format('Y-m-d H:i:s');
    }
}
