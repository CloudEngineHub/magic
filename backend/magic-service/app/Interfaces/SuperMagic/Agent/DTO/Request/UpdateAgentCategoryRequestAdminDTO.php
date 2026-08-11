<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Agent\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;
use Closure;

use function Hyperf\Translation\__;

class UpdateAgentCategoryRequestAdminDTO extends AbstractRequestDTO
{
    public ?array $nameI18n = null;

    public ?string $logo = null;

    public ?int $sortOrder = null;

    public ?int $status = null;

    private bool $logoProvided = false;

    public function setLogo(?string $logo): void
    {
        $this->logo = $logo;
        $this->logoProvided = true;
    }

    /** @return array{name_i18n?: array, logo?: ?string, sort_order?: int, status?: int} */
    public function getUpdatePayload(): array
    {
        $payload = [];
        if ($this->nameI18n !== null) {
            $payload['name_i18n'] = $this->nameI18n;
        }
        if ($this->logoProvided) {
            $payload['logo'] = $this->logo;
        }
        if ($this->sortOrder !== null) {
            $payload['sort_order'] = $this->sortOrder;
        }
        if ($this->status !== null) {
            $payload['status'] = $this->status;
        }
        return $payload;
    }

    protected static function getHyperfValidationRules(): array
    {
        return [
            'name_i18n' => [
                'sometimes',
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
            'logo' => 'sometimes|nullable|string|max:512',
            'sort_order' => 'sometimes|integer',
            'status' => 'sometimes|integer|in:0,1',
        ];
    }

    protected static function getHyperfValidationMessage(): array
    {
        return [
            'name_i18n.array' => __('super_magic.agent.name_i18n_must_be_array'),
            'name_i18n.*.string' => __('super_magic.agent.name_i18n_en_must_be_string'),
        ];
    }
}
