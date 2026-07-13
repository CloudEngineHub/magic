<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Request;

use Hyperf\Validation\Request\FormRequest;

use function Hyperf\Translation\__;

class SaveSlidesTemplateTagRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'parent_id' => 'nullable|integer|min:0',
            'node_type' => 'nullable|string|in:group,tag',
            'usage_type' => 'nullable|string|in:filter,detail,operational',
            'code' => 'required|string|max:64|regex:/^[a-z0-9]+([_-][a-z0-9]+)*$/',
            'name_i18n' => 'required|array',
            'name_i18n.zh_CN' => 'required|string|max:100',
            'name_i18n.en_US' => 'required|string|max:100',
            'description_i18n' => 'nullable|array',
            'description_i18n.zh_CN' => 'nullable|string|max:500',
            'description_i18n.en_US' => 'nullable|string|max:500',
            'aliases_i18n' => 'nullable|array',
            'is_visible' => 'nullable|boolean',
            'status' => 'nullable|integer|in:0,1',
            'sort' => 'nullable|integer',
        ];
    }

    public function messages(): array
    {
        return [
            'code.required' => __('slides_template.tag_code_required'),
            'code.string' => __('slides_template.tag_code_string'),
            'code.max' => __('slides_template.tag_code_max'),
            'code.regex' => __('slides_template.tag_code_regex'),
            'parent_id.integer' => __('slides_template.tag_parent_id_integer'),
            'parent_id.min' => __('slides_template.tag_parent_id_min'),
            'node_type.in' => __('slides_template.tag_node_type_in'),
            'usage_type.in' => __('slides_template.tag_usage_type_in'),
            'name_i18n.required' => __('slides_template.tag_name_required'),
            'name_i18n.array' => __('slides_template.tag_name_array'),
            'name_i18n.zh_CN.required' => __('slides_template.tag_name_zh_cn_required'),
            'name_i18n.zh_CN.max' => __('slides_template.tag_name_zh_cn_max'),
            'name_i18n.en_US.required' => __('slides_template.tag_name_en_us_required'),
            'name_i18n.en_US.max' => __('slides_template.tag_name_en_us_max'),
            'description_i18n.array' => __('slides_template.tag_description_array'),
            'description_i18n.zh_CN.max' => __('slides_template.tag_description_zh_cn_max'),
            'description_i18n.en_US.max' => __('slides_template.tag_description_en_us_max'),
            'aliases_i18n.array' => __('slides_template.tag_aliases_array'),
            'is_visible.boolean' => __('slides_template.tag_is_visible_boolean'),
            'status.in' => __('slides_template.status_in'),
            'sort.integer' => __('slides_template.sort_integer'),
        ];
    }

    public function getParentId(): int
    {
        return (int) $this->input('parent_id', 0);
    }

    public function getNodeType(): string
    {
        return (string) $this->input('node_type', 'tag');
    }

    public function getUsageType(): ?string
    {
        $usageType = $this->input('usage_type', 'filter');
        return $usageType === null || $usageType === '' ? null : (string) $usageType;
    }

    public function getCode(): string
    {
        return trim((string) $this->input('code', ''));
    }

    public function getNameI18n(): array
    {
        return (array) $this->input('name_i18n', []);
    }

    public function getDescriptionI18n(): array
    {
        return (array) $this->input('description_i18n', []);
    }

    public function getAliasesI18n(): array
    {
        return (array) $this->input('aliases_i18n', []);
    }

    public function isVisible(): bool
    {
        return (bool) $this->input('is_visible', true);
    }

    public function getStatus(): int
    {
        return (int) $this->input('status', 1);
    }

    public function getSort(): int
    {
        return (int) $this->input('sort', 0);
    }
}
