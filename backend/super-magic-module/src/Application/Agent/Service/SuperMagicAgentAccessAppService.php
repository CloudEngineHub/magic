<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Application\Agent\Service;

use App\Domain\Permission\Entity\ValueObject\OperationPermission\Operation;
use App\Domain\Permission\Entity\ValueObject\OperationPermission\ResourceType;
use App\Domain\Permission\Entity\ValueObject\OperationPermission\TargetType;
use App\Domain\Permission\Entity\ValueObject\PermissionDataIsolation;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\AgentSourceType;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\SuperMagicAgentDataIsolation;

class SuperMagicAgentAccessAppService extends AbstractSuperMagicAppService
{
    /**
     * usable_codes 仅包含当前用户可直接使用的员工（本地创建/已雇佣/官方）；
     * missing_codes 表示既不在这几个来源、也未在市场上架的员工 code。
     *
     * @param array<string> $agentCodes
     * @return array{usable_codes: array<string>, missing_codes: array<string>}
     */
    public function listUsableAgentCodes(string $organizationCode, string $userId, array $agentCodes): array
    {
        $agentCodes = $this->normalizeAgentCodes($agentCodes);
        if ($agentCodes === []) {
            return [
                'usable_codes' => [],
                'missing_codes' => [],
            ];
        }

        $foundAgentCodes = $this->findExistingAgentCodes($organizationCode, $userId, $agentCodes);
        $dataIsolation = SuperMagicAgentDataIsolation::create($organizationCode, $userId);
        $officialAgentCodes = array_values(array_intersect($agentCodes, $this->getOfficialAgentCodes($dataIsolation)));
        $ownerships = $this->userAgentDomainService->findUserAgentOwnershipsByCodes($dataIsolation, $agentCodes);
        $ownedAgentCodes = [];
        foreach ($ownerships as $agentCode => $ownership) {
            if (! in_array($ownership->getSourceType(), [AgentSourceType::LOCAL_CREATE, AgentSourceType::MARKET], true)) {
                continue;
            }
            $ownedAgentCodes[] = $agentCode;
        }
        // 市场已上架的员工与本地/雇佣关系是“或”的关系：视为存在，但不直接可用。
        $marketAgentCodes = array_values(array_intersect(
            $agentCodes,
            $this->marketEligibilityDomainService->listPublishedAgentCodes($agentCodes)
        ));
        $usableLookup = array_fill_keys(array_merge($ownedAgentCodes, $officialAgentCodes), true);

        $usableAgentCodes = [];
        foreach ($agentCodes as $agentCode) {
            if (isset($usableLookup[$agentCode])) {
                $usableAgentCodes[] = $agentCode;
            }
        }
        sort($usableAgentCodes, SORT_STRING);

        return [
            'usable_codes' => $usableAgentCodes,
            'missing_codes' => $this->collectMissingCodes(
                $agentCodes,
                array_values(array_unique(array_merge($foundAgentCodes, $ownedAgentCodes, $officialAgentCodes, $marketAgentCodes)))
            ),
        ];
    }

    /**
     * exists 表示员工对当前用户"存在"：本组织可见、已创建/已雇佣、官方员工，
     * 或已在员工市场上架（未雇佣时 exists=true 但 can_use=false）。
     *
     * @return array{code: string, exists: bool, can_use: bool}
     */
    public function checkUsableAgentCode(string $organizationCode, string $userId, string $agentCode): array
    {
        $normalizedCode = $this->normalizeAgentCodes([$agentCode])[0] ?? '';
        if ($normalizedCode === '') {
            return [
                'code' => '',
                'exists' => false,
                'can_use' => false,
            ];
        }

        $result = $this->listUsableAgentCodes($organizationCode, $userId, [$normalizedCode]);

        return [
            'code' => $normalizedCode,
            'exists' => ! in_array($normalizedCode, $result['missing_codes'], true),
            'can_use' => in_array($normalizedCode, $result['usable_codes'], true),
        ];
    }

    /**
     * @param array<string> $agentCodes
     * @return array{manageable_codes: array<string>, missing_codes: array<string>}
     */
    public function listManageableAgentCodes(string $organizationCode, string $userId, array $agentCodes): array
    {
        $agentCodes = $this->normalizeAgentCodes($agentCodes);
        if ($agentCodes === []) {
            return [
                'manageable_codes' => [],
                'missing_codes' => [],
            ];
        }

        $foundAgentCodes = $this->findExistingAgentCodes($organizationCode, $userId, $agentCodes);
        $manageableAgentCodes = [];
        if ($foundAgentCodes !== []) {
            $permissions = $this->operationPermissionDomainService->listByTargetIds(
                PermissionDataIsolation::create($organizationCode, $userId),
                ResourceType::CustomAgent,
                [$userId],
                $foundAgentCodes,
            );
            $manageableCodes = [];
            foreach ($permissions as $permission) {
                if (
                    $permission->getTargetType() !== TargetType::UserId
                    || $permission->getTargetId() !== $userId
                    || $permission->getOperation() !== Operation::Owner
                ) {
                    continue;
                }
                $manageableCodes[$permission->getResourceId()] = true;
            }

            foreach ($foundAgentCodes as $agentCode) {
                if (! isset($manageableCodes[$agentCode])) {
                    continue;
                }
                $manageableAgentCodes[] = $agentCode;
            }
            sort($manageableAgentCodes, SORT_STRING);
        }

        return [
            'manageable_codes' => $manageableAgentCodes,
            'missing_codes' => $this->collectMissingCodes($agentCodes, $foundAgentCodes),
        ];
    }

    /**
     * @param array<string> $agentCodes
     * @return array{accessible_codes: array<string>, missing_codes: array<string>}
     */
    public function listAccessibleAgentCodes(string $organizationCode, string $userId, array $agentCodes): array
    {
        $agentCodes = $this->normalizeAgentCodes($agentCodes);
        if ($agentCodes === []) {
            return [
                'accessible_codes' => [],
                'missing_codes' => [],
            ];
        }

        $foundAgentCodes = $this->findExistingAgentCodes($organizationCode, $userId, $agentCodes);
        $dataIsolation = SuperMagicAgentDataIsolation::create($organizationCode, $userId);
        // 完整员工关联资源同时允许创建者、协作者、已雇佣用户和官方员工读取。
        $readableCodes = $this->getAccessibleAgentCodes($dataIsolation, $userId)['codes'];
        $usableCodes = $this->getUsableAgentCodes($dataIsolation)['codes'];
        $officialCodes = array_values(array_intersect($agentCodes, $this->getOfficialAgentCodes($dataIsolation)));
        $accessibleLookup = array_fill_keys(array_merge($readableCodes, $usableCodes), true);

        $accessibleAgentCodes = [];
        foreach ($agentCodes as $agentCode) {
            if (! isset($accessibleLookup[$agentCode])) {
                continue;
            }
            $accessibleAgentCodes[] = $agentCode;
        }
        sort($accessibleAgentCodes, SORT_STRING);

        return [
            'accessible_codes' => $accessibleAgentCodes,
            'missing_codes' => $this->collectMissingCodes($agentCodes, array_merge($foundAgentCodes, $officialCodes)),
        ];
    }

    /**
     * @param array<string> $agentCodes
     * @return array<string>
     */
    private function normalizeAgentCodes(array $agentCodes): array
    {
        return array_values(array_unique(array_filter(array_map(
            static fn (mixed $value): string => trim((string) $value),
            $agentCodes
        ))));
    }

    /**
     * @param array<string> $agentCodes
     * @return array<string>
     */
    private function findExistingAgentCodes(string $organizationCode, string $userId, array $agentCodes): array
    {
        $agentEntities = $this->superMagicAgentDomainService->findByCodes(
            SuperMagicAgentDataIsolation::create($organizationCode, $userId),
            $agentCodes
        );

        $foundAgentCodes = [];
        foreach ($agentEntities as $agentEntity) {
            $agentCode = trim($agentEntity->getCode());
            if ($agentCode === '') {
                continue;
            }
            $foundAgentCodes[] = $agentCode;
        }
        return $foundAgentCodes;
    }

    /**
     * @param array<string> $requestedCodes
     * @param array<string> $foundAgentCodes
     * @return array<string>
     */
    private function collectMissingCodes(array $requestedCodes, array $foundAgentCodes): array
    {
        $foundLookup = array_fill_keys($foundAgentCodes, true);
        $missingCodes = [];
        foreach ($requestedCodes as $agentCode) {
            if (isset($foundLookup[$agentCode])) {
                continue;
            }
            $missingCodes[] = $agentCode;
        }
        return $missingCodes;
    }
}
