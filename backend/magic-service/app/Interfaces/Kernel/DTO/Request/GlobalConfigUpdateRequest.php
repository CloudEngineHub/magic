<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Kernel\DTO\Request;

use App\Application\Kernel\Enum\MaintenanceType;
use App\ErrorCode\PermissionErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use Hyperf\Contract\ValidatorInterface;
use Hyperf\Validation\Request\FormRequest;
use Hyperf\Validation\Rule;

class GlobalConfigUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'is_maintenance' => 'sometimes|boolean',
            'maintenance_type' => ['sometimes', 'string', Rule::in(MaintenanceType::values())],
            'maintenance_description' => 'sometimes|nullable|string|max:1000',
        ];
    }

    public function messages(): array
    {
        return [
            'maintenance_type.in' => 'global_config.invalid_maintenance_type',
        ];
    }

    protected function failedValidation(ValidatorInterface $validator)
    {
        $message = $validator->errors()->first() ?: 'global_config.validation_failed';
        ExceptionBuilder::throw(PermissionErrorCode::ValidateFailed, $message);
    }
}
