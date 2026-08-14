<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Skill\FormRequest;

use Hyperf\Validation\Request\FormRequest;

use function Hyperf\Translation\trans;

class SkillMarketFeaturedQueryFormRequest extends FormRequest
{
    /**
     * 验证规则.
     */
    public function rules(): array
    {
        return [
            'page' => 'nullable|integer|min:1',
            'page_size' => 'nullable|integer|min:1|max:1000',
        ];
    }

    /**
     * 自定义验证错误消息.
     */
    public function messages(): array
    {
        return [
            'page.integer' => trans('validation.integer', ['attribute' => 'page']),
            'page.min' => trans('validation.min.numeric', ['attribute' => 'page', 'min' => 1]),
            'page_size.integer' => trans('validation.integer', ['attribute' => 'page_size']),
            'page_size.min' => trans('validation.min.numeric', ['attribute' => 'page_size', 'min' => 1]),
            'page_size.max' => trans('validation.max.numeric', ['attribute' => 'page_size', 'max' => 1000]),
        ];
    }

    /**
     * 授权验证.
     */
    public function authorize(): bool
    {
        return true;
    }
}
