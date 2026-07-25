<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject;

final readonly class SuperMagicSandboxContext
{
    public function __construct(
        private string $id,
    ) {
    }

    public function getId(): string
    {
        return $this->id;
    }

    /**
     * @return array{id: string}
     */
    public function toArray(): array
    {
        return ['id' => $this->id];
    }
}
