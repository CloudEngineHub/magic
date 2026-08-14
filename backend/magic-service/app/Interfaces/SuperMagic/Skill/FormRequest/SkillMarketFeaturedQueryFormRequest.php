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
            'limit' => 'nullable|integer|min:1|max:20',
            'exclude_codes' => 'nullable|array',
            'exclude_codes.*' => 'string',
        ];
    }

    /**
     * 自定义验证错误消息.
     */
    public function messages(): array
    {
        return [
            'limit.integer' => trans('validation.integer', ['attribute' => 'limit']),
            'limit.min' => trans('validation.min.numeric', ['attribute' => 'limit', 'min' => 1]),
            'limit.max' => trans('validation.max.numeric', ['attribute' => 'limit', 'max' => 20]),
            'exclude_codes.array' => trans('validation.array', ['attribute' => 'exclude_codes']),
            'exclude_codes.*.string' => trans('validation.string', ['attribute' => 'exclude_codes']),
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
