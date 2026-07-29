<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Design\RequestForm;

use Hyperf\Validation\Request\FormRequest;

use function Hyperf\Translation\trans;

class CompleteTextContentFormRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'project_id' => 'required|integer|min:1',
            'user_prompt' => 'required|string|max:4096',
            'model_id' => 'nullable|string|max:80',
        ];
    }

    public function attributes(): array
    {
        return [
            'project_id' => trans('design.attributes.project_id'),
            'user_prompt' => trans('design.attributes.user_prompt'),
            'model_id' => trans('design.attributes.model_id'),
        ];
    }
}
