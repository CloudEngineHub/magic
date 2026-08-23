<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Request;

use Hyperf\Validation\Request\FormRequest;

final class SlidesTemplateVectorReindexRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'organization_code' => 'nullable|string|max:64',
            'template_ids' => 'nullable|array|max:500',
            'template_ids.*' => 'integer|min:1',
            'category_code' => 'nullable|string|max:64',
            'tag_codes' => 'nullable|array',
            'tag_codes.*' => 'string|max:64|regex:/^[a-z0-9]+(-[a-z0-9]+)*$/',
            'tag_match' => 'nullable|string|in:any,all',
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

    public function getCategoryCode(): ?string
    {
        $value = trim((string) $this->input('category_code', ''));
        return $value === '' ? null : $value;
    }

    public function getTagCodes(): array
    {
        $tagCodes = $this->input('tag_codes', []);
        if (! is_array($tagCodes)) {
            return [];
        }

        $result = [];
        foreach ($tagCodes as $tagCode) {
            if (! is_string($tagCode)) {
                continue;
            }
            $tagCode = trim($tagCode);
            if ($tagCode !== '') {
                $result[$tagCode] = $tagCode;
            }
        }
        return array_values($result);
    }

    public function getTagMatch(): string
    {
        $tagMatch = trim((string) $this->input('tag_match', 'any'));
        return in_array($tagMatch, ['any', 'all'], true) ? $tagMatch : 'any';
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
