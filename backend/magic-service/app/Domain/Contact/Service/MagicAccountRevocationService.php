<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Contact\Service;

use App\Domain\Contact\Entity\ValueObject\AccountStatus;
use App\Domain\Token\Entity\ValueObject\MagicTokenType;
use Hyperf\DbConnection\Db;

class MagicAccountRevocationService
{
    public function __construct(
        private readonly MagicAccountStatusService $statusService,
    ) {
    }

    /**
     * 禁用账号并撤销该账号下的本地凭证。
     *
     * Redis 中已经缓存的授权对象仍可能在其 60 秒 TTL 内被使用，缓存过期后会因数据库凭证已撤销而失效。
     *
     * @return array{
     *     magic_id: string,
     *     already_disabled: bool,
     *     user_count: int,
     *     account_tokens: int,
     *     user_tokens: int,
     *     api_keys: int
     * }
     */
    public function revoke(string $magicId): array
    {
        return Db::transaction(function () use ($magicId): array {
            $alreadyDisabled = ! $this->statusService->updateStatus($magicId, AccountStatus::Disable);

            $userIds = Db::table('magic_contact_users')
                ->where('magic_id', $magicId)
                ->pluck('user_id')
                ->filter(static fn ($userId): bool => (string) $userId !== '')
                ->map(static fn ($userId): string => (string) $userId)
                ->unique()
                ->values()
                ->all();

            $accountTokens = Db::table('magic_tokens')
                ->where('type', MagicTokenType::Account->value)
                ->where('type_relation_value', $magicId)
                ->delete();

            $userTokens = 0;
            $apiKeys = 0;
            if ($userIds !== []) {
                $userTokens = Db::table('magic_tokens')
                    ->whereIn('type', [
                        MagicTokenType::User->value,
                        MagicTokenType::PersonalAccessToken->value,
                        MagicTokenType::RefreshToken->value,
                        MagicTokenType::ModelGatewayUser->value,
                    ])
                    ->whereIn('type_relation_value', $userIds)
                    ->delete();

                $apiKeys = Db::table('magic_api_access_tokens')
                    ->where('type', 'user')
                    ->whereNull('deleted_at')
                    ->where(static function ($query) use ($userIds): void {
                        $query->whereIn('relation_id', $userIds)
                            ->orWhereIn('user_id', $userIds);
                    })
                    ->update([
                        'enabled' => 0,
                        'updated_at' => date('Y-m-d H:i:s'),
                    ]);
            }

            return [
                'magic_id' => $magicId,
                'already_disabled' => $alreadyDisabled,
                'user_count' => count($userIds),
                'account_tokens' => $accountTokens,
                'user_tokens' => $userTokens,
                'api_keys' => $apiKeys,
            ];
        });
    }
}
