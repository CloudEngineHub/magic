<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Audit\ModelCall\Service;

use App\Domain\Provider\Entity\ValueObject\ProviderVirtualIdentity;
use App\Domain\Provider\Service\ProviderConfigDomainService;
use App\Infrastructure\Util\OfficialOrganizationUtil;

final class AuditStatisticsProviderService
{
    public function __construct(
        private readonly ProviderConfigDomainService $providerConfigDomainService,
    ) {
    }

    /**
     * Resolve external provider filters into the repository's config ID collection.
     *
     * @param array<string, mixed> $filters
     * @return array<string, mixed>
     */
    public function normalizeFilters(array $filters): array
    {
        $configId = trim((string) ($filters['service_provider_config_id'] ?? ''));
        $hasVirtualId = ProviderVirtualIdentity::isPlatformOfficialId($configId);

        unset($filters['service_provider_config_id']);

        if ($configId === '') {
            return $filters;
        }

        $filters['service_provider_config_ids'] = $hasVirtualId
            ? $this->providerConfigDomainService->getOfficialOrganizationConfigIds()
            : ($this->isPositiveConfigId($configId) ? [(int) $configId] : []);

        return $filters;
    }

    /**
     * Fill current provider names without changing real config IDs or regrouping rows.
     *
     * @param array<int, array<string, mixed>> $breakdown
     * @return array<int, array<string, mixed>>
     */
    public function fillNames(array $breakdown, bool $isOfficialOrganization): array
    {
        $configIds = [];
        foreach ($breakdown as $row) {
            $configId = (string) ($row['service_provider_config_id'] ?? '');
            if ($configId !== '' && ctype_digit($configId)) {
                $configIds[] = (int) $configId;
            }
        }

        $configIds = array_values(array_unique($configIds));
        if ($configIds === []) {
            foreach ($breakdown as &$row) {
                $row['provider_name'] = '';
                $row['provider_alias'] = '';
            }
            unset($row);
            return $breakdown;
        }

        $identityMetadata = $this->providerConfigDomainService->getProviderConfigIdentityMetadataByIds($configIds);
        $officialOrganizationCode = OfficialOrganizationUtil::getOfficialOrganizationCode();

        foreach ($breakdown as &$row) {
            $configId = (int) ($row['service_provider_config_id'] ?? 0);
            $metadata = $identityMetadata[$configId] ?? null;
            if ($metadata === null) {
                $row['provider_name'] = '';
                $row['provider_alias'] = '';
                continue;
            }

            if (! $isOfficialOrganization
                && $metadata['organization_code'] === $officialOrganizationCode
            ) {
                $row['provider_name'] = ProviderVirtualIdentity::PLATFORM_OFFICIAL_NAME;
                $row['provider_alias'] = ProviderVirtualIdentity::PLATFORM_OFFICIAL_NAME;
                continue;
            }

            $row['provider_name'] = $metadata['provider_name'];
            $row['provider_alias'] = $metadata['provider_alias'];
        }
        unset($row);

        return $breakdown;
    }

    private function isPositiveConfigId(string $configId): bool
    {
        return ctype_digit($configId) && (int) $configId > 0;
    }
}
