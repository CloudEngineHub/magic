<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Request;

use Hyperf\Validation\Request\FormRequest;

use function Hyperf\Translation\__;

class SaveSlidesTemplateCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'code' => 'nullable|string|max:64|regex:/^(PPT|SLIDE)-CATE-[a-z0-9]+(-[a-z0-9]+)*$/',
            'name_i18n' => 'required|array',
            'name_i18n.zh_CN' => 'required|string|max:100',
            'name_i18n.en_US' => 'required|string|max:100',
            'status' => 'nullable|integer|in:0,1',
            'sort' => 'nullable|integer',
        ];
    }

    public function messages(): array
    {
        return [
            'code.required' => __('slides_template.category_code_required'),
            'code.string' => __('slides_template.category_code_string'),
            'code.max' => __('slides_template.category_code_max'),
            'code.regex' => __('slides_template.category_code_regex'),
            'name_i18n.required' => __('slides_template.category_name_required'),
            'name_i18n.array' => __('slides_template.category_name_array'),
            'name_i18n.zh_CN.required' => __('slides_template.category_name_zh_cn_required'),
            'name_i18n.zh_CN.max' => __('slides_template.category_name_zh_cn_max'),
            'name_i18n.en_US.required' => __('slides_template.category_name_en_us_required'),
            'name_i18n.en_US.max' => __('slides_template.category_name_en_us_max'),
            'status.in' => __('slides_template.status_in'),
            'sort.integer' => __('slides_template.sort_integer'),
        ];
    }

    public function getCode(): ?string
    {
        $code = trim((string) $this->input('code', ''));
        return $code === '' ? null : $code;
    }

    public function getNameI18n(): array
    {
        return (array) $this->input('name_i18n', []);
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
