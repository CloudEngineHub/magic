<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Agent\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;

use function Hyperf\Translation\__;

class QueryAgentCategoriesRequestAdminDTO extends AbstractRequestDTO
{
    public ?int $status = null;

    public ?string $keyword = null;

    public function setStatus(null|int|string $value): void
    {
        $this->status = $value === null || $value === '' ? null : (int) $value;
    }

    public function getStatus(): ?int
    {
        return $this->status;
    }

    public function getKeyword(): ?string
    {
        $keyword = trim((string) ($this->keyword ?? ''));
        return $keyword === '' ? null : $keyword;
    }

    protected static function getHyperfValidationRules(): array
    {
        return [
            'status' => 'sometimes|nullable|integer|in:0,1',
            'keyword' => 'sometimes|nullable|string|max:255',
        ];
    }

    protected static function getHyperfValidationMessage(): array
    {
        return [
            'status.integer' => __('validation.integer', ['attribute' => 'status']),
            'status.in' => __('validation.in', ['attribute' => 'status']),
            'keyword.string' => __('validation.string', ['attribute' => 'keyword']),
            'keyword.max' => __('validation.max.string', ['attribute' => 'keyword', 'max' => 255]),
        ];
    }
}
