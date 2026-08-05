<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MagicBase\DTO;

use App\Infrastructure\Core\AbstractDTO;
use DateTimeInterface;

abstract class AbstractMagicBaseDTO extends AbstractDTO
{
    /**
     * @return array<string, mixed> JSON-ready DTO payload keyed by snake_case field name
     */
    public function jsonSerialize(): array
    {
        $json = [];
        /* @phpstan-ignore-next-line */
        foreach ($this as $key => $value) {
            if ($value === null) {
                continue;
            }
            $key = $this->getUnCamelizeValueFromCache($key);
            if ($value instanceof DateTimeInterface) {
                $value = $value->format('Y-m-d H:i:s');
            }
            $json[$key] = $value;
        }

        return $json;
    }
}
