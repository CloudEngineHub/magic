<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Request;

use Hyperf\Validation\Request\FormRequest;

use function Hyperf\Translation\__;

class UpdateSlidesTemplateSortRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'sort' => 'required|integer',
        ];
    }

    public function messages(): array
    {
        return [
            'sort.required' => __('slides_template.sort_integer'),
            'sort.integer' => __('slides_template.sort_integer'),
        ];
    }

    public function getSort(): int
    {
        return (int) $this->input('sort');
    }
}
