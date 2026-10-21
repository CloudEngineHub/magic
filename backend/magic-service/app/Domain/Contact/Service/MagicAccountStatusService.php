<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Contact\Service;

use App\Domain\Contact\Entity\ValueObject\AccountStatus;
use App\Domain\Contact\Repository\Facade\MagicAccountRepositoryInterface;
use Hyperf\DbConnection\Db;

class MagicAccountStatusService
{
    public function __construct(
        private readonly MagicAccountRepositoryInterface $accountRepository,
    ) {
    }

    public function enable(string $magicId): bool
    {
        return Db::transaction(function () use ($magicId): bool {
            return $this->updateStatus($magicId, AccountStatus::Normal);
        });
    }

    /**
     * Update an account status inside the caller's transaction.
     */
    public function updateStatus(string $magicId, AccountStatus $targetStatus): bool
    {
        return $this->accountRepository->updateStatus($magicId, $targetStatus);
    }
}
