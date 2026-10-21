<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Contact\Service;

use App\Domain\Contact\Entity\ValueObject\AccountStatus;
use Hyperf\DbConnection\Db;
use RuntimeException;

class MagicAccountStatusService
{
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
        $account = Db::table('magic_contact_accounts')
            ->where('magic_id', $magicId)
            ->whereNull('deleted_at')
            ->lockForUpdate()
            ->first();

        if ($account === null) {
            throw new RuntimeException('账号不存在或已删除。');
        }

        $status = (int) $account->status;
        if ($status !== AccountStatus::Disable->value && $status !== AccountStatus::Normal->value) {
            throw new RuntimeException("账号 {$magicId} 的状态值 {$status} 不受支持。");
        }

        if ($status === $targetStatus->value) {
            return false;
        }

        Db::table('magic_contact_accounts')
            ->where('id', $account->id)
            ->update([
                'status' => $targetStatus->value,
                'updated_at' => date('Y-m-d H:i:s'),
            ]);

        return true;
    }
}
