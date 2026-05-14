<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MagicBase\DTO\Response;

use App\Interfaces\MagicBase\DTO\AbstractMagicBaseDTO;

class MagicBaseRowResponseDTO extends AbstractMagicBaseDTO
{
    /** @var array<string, mixed> Dynamic row response payload keyed by selected field or relation alias. */
    protected array $payload = [];

    /**
     * @param null|array{payload?: array<string, mixed>} $data
     */
    public function __construct(?array $data = null)
    {
        if ($data !== null && array_key_exists('payload', $data)) {
            $this->payload = is_array($data['payload']) ? $data['payload'] : [];
            return;
        }
        parent::__construct($data);
    }

    /**
     * @return array<string, mixed>
     */
    public function getPayload(): array
    {
        return $this->payload;
    }

    /**
     * @param array<string, mixed> $payload
     */
    public function setPayload(array $payload): void
    {
        $this->payload = $payload;
    }

    /**
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return $this->payload;
    }
}
