<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Application\SuperAgent\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;

class UpdateMicroAppRequestDTO extends AbstractRequestDTO
{
    public ?string $appName = null;

    public ?string $coverFileKey = null;

    private bool $appNameProvided = false;

    private bool $coverFileKeyProvided = false;

    public function getAppName(): ?string
    {
        return $this->appName;
    }

    public function setAppName(?string $appName): void
    {
        $this->appNameProvided = true;
        $this->appName = trim($appName ?? '');
    }

    public function hasAppName(): bool
    {
        return $this->appNameProvided;
    }

    public function getCoverFileKey(): ?string
    {
        return $this->coverFileKey;
    }

    public function setCoverFileKey(?string $coverFileKey): void
    {
        $this->coverFileKeyProvided = true;
        $coverFileKey = trim($coverFileKey ?? '');
        $this->coverFileKey = $coverFileKey === '' ? null : $coverFileKey;
    }

    public function hasCoverFileKey(): bool
    {
        return $this->coverFileKeyProvided;
    }

    public function hasUpdates(): bool
    {
        return $this->appNameProvided || $this->coverFileKeyProvided;
    }

    protected static function getHyperfValidationRules(): array
    {
        return [
            'app_name' => 'sometimes|string|max:100|regex:/.*\S.*/u',
            'cover_file_key' => 'nullable|string|max:512',
        ];
    }

    protected static function getHyperfValidationMessage(): array
    {
        return [
            'app_name.regex' => 'Micro app name cannot be blank',
            'app_name.max' => 'Micro app name cannot exceed 100 characters',
            'cover_file_key.max' => 'Cover file key cannot exceed 512 characters',
        ];
    }
}
