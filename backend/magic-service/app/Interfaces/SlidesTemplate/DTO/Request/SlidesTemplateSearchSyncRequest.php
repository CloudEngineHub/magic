<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Request;

use Hyperf\Validation\Request\FormRequest;

final class SlidesTemplateSearchSyncRequest extends FormRequest
{
    /** The endpoint is protected by the API permission layer. */
    public function authorize(): bool
    {
        return true;
    }

    /** Validate the cursor page size and optional template scope for a full synchronization. */
    public function rules(): array
    {
        return [
            'organization_code' => 'nullable|string|max:64',
            'template_ids' => 'nullable|array|max:500',
            'template_ids.*' => 'integer|min:1',
            'after_id' => 'nullable|integer|min:0',
            'batch_size' => 'nullable|integer|min:1|max:500',
            'force' => 'nullable|boolean',
        ];
    }

    public function getOrganizationCode(): ?string
    {
        $value = trim((string) $this->input('organization_code', ''));
        return $value === '' ? null : $value;
    }

    public function getTemplateIds(): array
    {
        return array_values(array_unique(array_map('strval', (array) $this->input('template_ids', []))));
    }

    public function getAfterId(): string
    {
        return (string) $this->input('after_id', '0');
    }

    public function getBatchSize(): int
    {
        return min(500, max(1, (int) $this->input('batch_size', 100)));
    }

    public function isForce(): bool
    {
        return (bool) $this->input('force', false);
    }
}
