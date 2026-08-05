<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Mode\DTO\Request;

use Hyperf\Validation\Request\FormRequest;

class UpdateSystemDefaultAgentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'default_agent_code' => 'required|string|max:50',
        ];
    }

    public function getDefaultAgentCode(): string
    {
        return trim((string) $this->input('default_agent_code', ''));
    }
}
