<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Agent\Repository\Facade;

use App\Domain\SuperMagic\Agent\Entity\UserAgentEntity;
use App\Domain\SuperMagic\Agent\Entity\ValueObject\SuperMagicAgentDataIsolation;

interface UserAgentRepositoryInterface
{
    public function save(SuperMagicAgentDataIsolation $dataIsolation, UserAgentEntity $entity): UserAgentEntity;

    public function findByAgentCode(SuperMagicAgentDataIsolation $dataIsolation, string $agentCode): ?UserAgentEntity;

    /**
     * @return array<string, UserAgentEntity>
     */
    public function findByAgentCodes(SuperMagicAgentDataIsolation $dataIsolation, array $agentCodes): array;

    /**
     * @param array<string> $sourceTypes
     * @return array<string>
     */
    public function findAgentCodesBySourceTypes(SuperMagicAgentDataIsolation $dataIsolation, array $sourceTypes): array;

    /**
     * @param array<int> $agentVersionIds
     * @return array<int, UserAgentEntity>
     */
    public function findByAgentVersionIds(SuperMagicAgentDataIsolation $dataIsolation, array $agentVersionIds): array;

    /**
     * @return UserAgentEntity[]
     */
    public function findAllByAgentCode(SuperMagicAgentDataIsolation $dataIsolation, string $agentCode): array;

    /**
     * @return UserAgentEntity[]
     */
    public function findAllByMarketSource(SuperMagicAgentDataIsolation $dataIsolation, int $marketId): array;

    /**
     * @param array<string> $userIds
     */
    public function deleteByMarketSourceAndUsers(SuperMagicAgentDataIsolation $dataIsolation, int $marketId, array $userIds): int;

    public function deleteByAgentCodeExceptUser(SuperMagicAgentDataIsolation $dataIsolation, string $agentCode, string $excludedUserId): int;

    public function deleteAllByAgentCode(SuperMagicAgentDataIsolation $dataIsolation, string $agentCode): int;

    public function deleteByAgentCode(SuperMagicAgentDataIsolation $dataIsolation, string $agentCode): bool;
}
