<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Agent\Service;

use App\Domain\SuperMagic\Agent\Entity\UserAgentEntity;
use App\Domain\SuperMagic\Agent\Entity\ValueObject\SuperMagicAgentDataIsolation;
use App\Domain\SuperMagic\Agent\Repository\Facade\UserAgentRepositoryInterface;

class UserAgentDomainService
{
    public function __construct(
        protected UserAgentRepositoryInterface $userAgentRepository
    ) {
    }

    public function saveUserAgentOwnership(SuperMagicAgentDataIsolation $dataIsolation, UserAgentEntity $entity): UserAgentEntity
    {
        return $this->userAgentRepository->save($dataIsolation, $entity);
    }

    public function findUserAgentOwnershipByCode(SuperMagicAgentDataIsolation $dataIsolation, string $agentCode): ?UserAgentEntity
    {
        return $this->userAgentRepository->findByAgentCode($dataIsolation, $agentCode);
    }

    /**
     * 历史迁移按员工收口时，需要枚举同组织下所有用户的现有关系。
     *
     * @return UserAgentEntity[]
     */
    public function findAllUserAgentOwnershipsByCode(SuperMagicAgentDataIsolation $dataIsolation, string $agentCode): array
    {
        return $this->userAgentRepository->findAllByAgentCode($dataIsolation, $agentCode);
    }

    /**
     * @param array<string> $agentCodes
     * @return array<string, UserAgentEntity>
     */
    public function findUserAgentOwnershipsByCodes(SuperMagicAgentDataIsolation $dataIsolation, array $agentCodes): array
    {
        return $this->userAgentRepository->findByAgentCodes($dataIsolation, $agentCodes);
    }

    /**
     * @param array<string> $sourceTypes
     * @return array<string>
     */
    public function findAgentCodesBySourceTypes(SuperMagicAgentDataIsolation $dataIsolation, array $sourceTypes): array
    {
        return $this->userAgentRepository->findAgentCodesBySourceTypes($dataIsolation, $sourceTypes);
    }

    /**
     * @param array<int> $agentVersionIds
     * @return array<int, UserAgentEntity>
     */
    public function findUserAgentOwnershipsByVersionIds(SuperMagicAgentDataIsolation $dataIsolation, array $agentVersionIds): array
    {
        return $this->userAgentRepository->findByAgentVersionIds($dataIsolation, $agentVersionIds);
    }

    public function deleteUserAgentOwnership(SuperMagicAgentDataIsolation $dataIsolation, string $agentCode): bool
    {
        return $this->userAgentRepository->deleteByAgentCode($dataIsolation, $agentCode);
    }

    /**
     * @return UserAgentEntity[]
     */
    public function findUserAgentOwnershipsByMarketSource(SuperMagicAgentDataIsolation $dataIsolation, int $marketId): array
    {
        return $this->userAgentRepository->findAllByMarketSource($dataIsolation, $marketId);
    }

    /**
     * @param array<string> $userIds
     */
    public function deleteUserAgentOwnershipsByMarketSourceAndUsers(
        SuperMagicAgentDataIsolation $dataIsolation,
        int $marketId,
        array $userIds
    ): int {
        return $this->userAgentRepository->deleteByMarketSourceAndUsers($dataIsolation, $marketId, $userIds);
    }

    public function deleteAllUserAgentOwnershipsByCode(SuperMagicAgentDataIsolation $dataIsolation, string $agentCode): int
    {
        return $this->userAgentRepository->deleteAllByAgentCode($dataIsolation, $agentCode);
    }

    public function deleteUserAgentOwnershipsExceptUser(
        SuperMagicAgentDataIsolation $dataIsolation,
        string $agentCode,
        string $excludedUserId
    ): int {
        return $this->userAgentRepository->deleteByAgentCodeExceptUser(
            $dataIsolation,
            $agentCode,
            $excludedUserId
        );
    }
}
