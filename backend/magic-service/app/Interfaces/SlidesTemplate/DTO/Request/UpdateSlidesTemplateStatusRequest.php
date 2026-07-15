<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Request;

use Hyperf\Validation\Request\FormRequest;

use function Hyperf\Translation\__;

class UpdateSlidesTemplateStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'status' => 'required|integer|in:0,1',
        ];
    }

    public function messages(): array
    {
        return [
            'status.required' => __('slides_template.status_in'),
            'status.in' => __('slides_template.status_in'),
        ];
    }

    public function getStatus(): int
    {
        return (int) $this->input('status');
    }
}
