<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Common\Entity\ValueObject;

/**
 * Output Tokens Details Value Object.
 */
class OutputTokensDetails
{
    public function __construct(
        private ?int $reasoningTokens
    ) {
    }

    public static function fromArray(?array $data): ?self
    {
        if (empty($data)) {
            return null;
        }

        return new self(
            $data['reasoning_tokens'] ?? null
        );
    }

    public function toArray(): array
    {
        return [
            'reasoning_tokens' => $this->reasoningTokens,
        ];
    }

    public function getReasoningTokens(): ?int
    {
        return $this->reasoningTokens;
    }
}
