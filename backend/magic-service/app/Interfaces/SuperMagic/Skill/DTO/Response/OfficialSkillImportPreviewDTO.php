<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Skill\DTO\Response;

use JsonSerializable;

final readonly class OfficialSkillImportPreviewDTO implements JsonSerializable
{
    public function __construct(
        private string $importToken,
        private string $code,
        private string $packageDescription,
        private bool $isUpdate,
        private ?int $marketId = null,
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'import_token' => $this->importToken,
            'code' => $this->code,
            'package_description' => $this->packageDescription,
            'is_update' => $this->isUpdate,
            'market_id' => $this->marketId,
        ];
    }
}
