<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Agent\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;
use Closure;

use function Hyperf\Translation\__;

class CreateAgentCategoryRequestAdminDTO extends AbstractRequestDTO
{
    public array $nameI18n;

    public ?string $logo = null;

    public int $sortOrder = 0;

    public int $status = 1;

    protected static function getHyperfValidationRules(): array
    {
        return [
            'name_i18n' => [
                'required',
                'array',
                'min:1',
                static function (string $attribute, mixed $value, Closure $fail): void {
                    if (! is_array($value)) {
                        return;
                    }

                    foreach ($value as $name) {
                        if (is_string($name) && trim($name) !== '') {
                            return;
                        }
                    }

                    $fail(__('super_magic.agent.name_i18n_required'));
                },
            ],
            'name_i18n.*' => 'required|string',
            'logo' => 'nullable|string|max:512',
            'sort_order' => 'nullable|integer',
            'status' => 'sometimes|integer|in:0,1',
        ];
    }

    protected static function getHyperfValidationMessage(): array
    {
        return [
            'name_i18n.required' => __('super_magic.agent.name_i18n_required'),
            'name_i18n.array' => __('super_magic.agent.name_i18n_must_be_array'),
            'name_i18n.*.string' => __('super_magic.agent.name_i18n_en_must_be_string'),
        ];
    }
}
