<?php

declare(strict_types=1);

namespace App\Interfaces\Asset\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;

class TransferAssetOwnerRequestDTO extends AbstractRequestDTO
{
    public array $assetIds = [];
    public string $ownerUid = '';

    public function setAssetIds(mixed $value): void { $this->assetIds = array_values(array_filter(array_map('strval', (array) $value))); }
    public function setOwnerUid(mixed $value): void { $this->ownerUid = trim((string) $value); }
    public function getAssetIds(): array { return $this->assetIds; }
    public function getOwnerUid(): string { return $this->ownerUid; }

    protected static function getHyperfValidationRules(): array
    {
        return ['asset_ids' => 'required|array|min:1', 'asset_ids.*' => 'required|string', 'owner_uid' => 'required|string|max:64'];
    }
}
