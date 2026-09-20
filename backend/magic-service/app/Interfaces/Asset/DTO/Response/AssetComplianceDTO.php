<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Asset\DTO\Response;

use App\Domain\Asset\Entity\ProviderAssetEntity;
use App\Domain\Asset\Entity\ValueObject\ProviderAssetStatus;
use App\Infrastructure\Core\AbstractDTO;

class AssetComplianceDTO extends AbstractDTO
{
    public string $assetId;

    public string $complianceStatus;

    public ?string $complianceFailedReason;

    public function __construct(int|string $assetId, ?ProviderAssetEntity $providerAsset)
    {
        $this->assetId = (string) $assetId;
        $this->complianceStatus = ($providerAsset?->getProviderStatus() ?? ProviderAssetStatus::UNVERIFIED)->value;
        $this->complianceFailedReason = $providerAsset?->getProviderFailedReason();
        parent::__construct();
    }
}
