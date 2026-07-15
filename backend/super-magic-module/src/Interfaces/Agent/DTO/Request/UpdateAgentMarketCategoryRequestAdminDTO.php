<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Interfaces\Agent\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;

class UpdateAgentMarketCategoryRequestAdminDTO extends AbstractRequestDTO
{
    public ?int $categoryId = null;

    public function setCategoryId(null|int|string $value): void
    {
        $this->categoryId = $value === null ? null : (int) $value;
    }

    protected static function getHyperfValidationRules(): array
    {
        return ['category_id' => 'present|nullable|integer'];
    }

    protected static function getHyperfValidationMessage(): array
    {
        return [];
    }
}
