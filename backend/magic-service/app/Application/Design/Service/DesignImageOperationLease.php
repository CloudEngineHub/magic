<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Design\Service;

readonly class DesignImageOperationLease
{
    private const STATUS_ACQUIRED = 'acquired';

    private const STATUS_ALREADY_RUNNING = 'already_running';

    private const STATUS_REJECTED = 'rejected';

    private const STATUS_UNLIMITED = 'unlimited';

    private function __construct(
        private int $taskId,
        private string $token,
        private string $status,
    ) {
    }

    public static function acquired(int $taskId, string $token): self
    {
        return new self($taskId, $token, self::STATUS_ACQUIRED);
    }

    public static function alreadyRunning(int $taskId): self
    {
        return new self($taskId, '', self::STATUS_ALREADY_RUNNING);
    }

    public static function rejected(int $taskId): self
    {
        return new self($taskId, '', self::STATUS_REJECTED);
    }

    public static function unlimited(int $taskId): self
    {
        return new self($taskId, '', self::STATUS_UNLIMITED);
    }

    public function canProceed(): bool
    {
        return in_array($this->status, [self::STATUS_ACQUIRED, self::STATUS_UNLIMITED], true);
    }

    public function ownsSlot(): bool
    {
        return $this->status === self::STATUS_ACQUIRED;
    }

    public function getTaskId(): int
    {
        return $this->taskId;
    }

    public function getToken(): string
    {
        return $this->token;
    }
}
