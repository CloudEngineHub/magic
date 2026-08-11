<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Agent\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;
use Closure;

use function Hyperf\Translation\__;

class CheckAgentAccessRequestDTO extends AbstractRequestDTO
{
    public string $code = '';

    public static function getHyperfValidationRules(): array
    {
        return [
            'code' => [
                'required',
                'string',
                'max:50',
                static function (string $attribute, mixed $value, Closure $fail): void {
                    if (is_string($value) && trim($value) === '') {
                        $fail(__('validation.required', ['attribute' => $attribute]));
                    }
                },
            ],
        ];
    }

    public static function getHyperfValidationMessage(): array
    {
        return [
            'code.required' => __('validation.required', ['attribute' => 'code']),
            'code.string' => __('validation.string', ['attribute' => 'code']),
            'code.max' => __('validation.max.string', ['attribute' => 'code', 'max' => 50]),
        ];
    }

    public function getCode(): string
    {
        return trim($this->code);
    }
}
