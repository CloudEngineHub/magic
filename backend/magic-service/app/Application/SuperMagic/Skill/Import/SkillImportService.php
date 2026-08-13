<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Skill\Import;

use App\Application\SuperMagic\Skill\DTO\SkillPackageDTO;
use App\ErrorCode\SkillErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Util\IdGenerator\IdGenerator;
use App\Infrastructure\Util\Locker\LockerInterface;
use Hyperf\DbConnection\Db;
use Hyperf\Redis\Redis;
use Throwable;

final class SkillImportService
{
    public const EXPIRES_IN_SECONDS = 4 * 3600;

    public function __construct(
        private readonly Redis $redis,
        private readonly SkillPackageParser $skillPackageParser,
        private readonly LockerInterface $locker,
    ) {
    }

    public function parseByFileKey(string $organizationCode, string $fileKey): SkillPackageDTO
    {
        return $this->skillPackageParser->parseByFileKey($organizationCode, $fileKey);
    }

    public function parseFile(string $filePath, string $fileKey = ''): SkillPackageDTO
    {
        return $this->skillPackageParser->parseFile($filePath, $fileKey);
    }

    public function generate(string $keyPrefix, array $data): string
    {
        $token = IdGenerator::getUniqueIdSha256();
        $this->redis->setex(
            $keyPrefix . $token,
            self::EXPIRES_IN_SECONDS,
            json_encode(array_merge($data, ['expires_at' => time() + self::EXPIRES_IN_SECONDS]), JSON_THROW_ON_ERROR)
        );

        return $token;
    }

    /** @return array<string, mixed> */
    public function get(string $keyPrefix, string $token): array
    {
        $data = $this->redis->get($keyPrefix . $token);
        if (! is_string($data) || $data === '') {
            ExceptionBuilder::throw(SkillErrorCode::INVALID_IMPORT_TOKEN, 'skill.invalid_import_token');
        }

        $tokenData = json_decode($data, true);
        if (! is_array($tokenData) || ($tokenData['expires_at'] ?? 0) < time()) {
            ExceptionBuilder::throw(SkillErrorCode::IMPORT_TOKEN_EXPIRED, 'skill.import_token_expired');
        }

        return $tokenData;
    }

    public function delete(string $keyPrefix, string $token): void
    {
        $this->redis->del($keyPrefix . $token);
    }

    public function execute(
        string $lockKey,
        callable $callback,
        ?string $tokenPrefix = null,
        ?string $token = null,
    ): mixed {
        $lockOwner = IdGenerator::getUniqueId32();
        if (! $this->locker->mutexLock($lockKey, $lockOwner, 60)) {
            ExceptionBuilder::throw(SkillErrorCode::IMPORT_CONCURRENT_ERROR, 'skill.import_concurrent_error');
        }

        try {
            Db::beginTransaction();
            try {
                $result = $callback();
                Db::commit();

                if ($tokenPrefix !== null && $token !== null && $token !== '') {
                    $this->delete($tokenPrefix, $token);
                }

                return $result;
            } catch (Throwable $e) {
                Db::rollBack();
                throw $e;
            }
        } finally {
            $this->locker->release($lockKey, $lockOwner);
        }
    }
}
