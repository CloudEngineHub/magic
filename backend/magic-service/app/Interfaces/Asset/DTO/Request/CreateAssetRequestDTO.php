<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Asset\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;

class CreateAssetRequestDTO extends AbstractRequestDTO
{
    public string $assetKind = 'ASSET';

    public ?string $assetBusinessType = 'GENERAL';

    public ?int $parentId = null;

    public array $nameI18n = [];

    public ?array $descriptionI18n = null;

    public ?string $fileKey = null;

    public ?int $status = null;

    public function getAssetKind(): string
    {
        return $this->assetKind;
    }

    public function getAssetBusinessType(): ?string
    {
        return $this->assetBusinessType;
    }

    public function getParentId(): ?int
    {
        return $this->parentId;
    }

    public function getNameI18n(): array
    {
        return $this->nameI18n;
    }

    public function getDescriptionI18n(): ?array
    {
        return $this->descriptionI18n;
    }

    public function getFileKey(): ?string
    {
        return $this->fileKey;
    }

    public function setAssetKind(mixed $value): void
    {
        $this->assetKind = (string) ($value ?: 'ASSET');
    }

    public function setAssetBusinessType(mixed $value): void
    {
        $this->assetBusinessType = $value === null || $value === '' ? 'GENERAL' : (string) $value;
    }

    public function setParentId(mixed $value): void
    {
        $this->parentId = $value === null || $value === '' ? null : (int) $value;
    }

    public function setNameI18n(mixed $value): void
    {
        $this->nameI18n = (array) ($value ?? []);
    }

    public function setDescriptionI18n(mixed $value): void
    {
        $this->descriptionI18n = $value === null ? null : (array) $value;
    }

    public function setFileKey(mixed $value): void
    {
        $this->fileKey = $value === null ? null : (string) $value;
    }

    public function setStatus(mixed $value): void
    {
        $this->status = $value === null || $value === '' ? null : (int) $value;
    }

    protected static function getHyperfValidationRules(): array
    {
        return [
            'asset_kind' => 'nullable|string|in:ASSET,GROUP',
            'asset_business_type' => 'nullable|string|max:64',
            'parent_id' => 'nullable|integer|min:1',
            'name_i18n' => 'nullable|array',
            'description_i18n' => 'nullable|array',
            'file_key' => 'required_if:asset_kind,ASSET|nullable|string|max:512',
            'status' => 'nullable|integer|in:0,1',
        ];
    }

    protected static function getHyperfValidationMessage(): array
    {
        return [
            'asset_kind.in' => __('asset.validation.asset_kind_in'),
            'asset_business_type.string' => __('asset.validation.asset_business_type_string'),
            'asset_business_type.max' => __('asset.validation.asset_business_type_max'),
            'parent_id.integer' => __('asset.validation.parent_id_integer'),
            'parent_id.min' => __('asset.validation.parent_id_min'),
            'name_i18n.array' => __('asset.validation.name_i18n_array'),
            'description_i18n.array' => __('asset.validation.description_i18n_array'),
            'file_key.required_if' => __('asset.validation.file_key_required'),
            'file_key.string' => __('asset.validation.file_key_string'),
            'file_key.max' => __('asset.validation.file_key_max'),
            'status.integer' => __('asset.validation.status_integer'),
            'status.in' => __('asset.validation.status_in'),
        ];
    }
}
