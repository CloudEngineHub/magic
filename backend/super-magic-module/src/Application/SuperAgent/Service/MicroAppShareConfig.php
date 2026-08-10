<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Application\SuperAgent\Service;

use Dtyq\SuperMagic\Application\SuperAgent\DTO\Request\PublishMicroAppRequestDTO;
use Dtyq\SuperMagic\Interfaces\Share\DTO\Request\CreateShareRequestDTO;

final class MicroAppShareConfig
{
    public function buildExtra(?array $existingExtra, PublishMicroAppRequestDTO $requestDTO): ?array
    {
        if (! $requestDTO->hasPureMode()) {
            return null;
        }

        return array_merge($existingExtra ?? [], [
            CreateShareRequestDTO::EXTRA_FIELD_PURE_MODE => $requestDTO->isPureMode(),
        ]);
    }

    public function isPureMode(?array $extra): bool
    {
        $value = $extra[CreateShareRequestDTO::EXTRA_FIELD_PURE_MODE] ?? false;
        if (is_bool($value)) {
            return $value;
        }

        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }
}
