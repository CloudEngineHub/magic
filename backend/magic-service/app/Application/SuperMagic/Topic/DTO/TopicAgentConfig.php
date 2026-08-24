<?php

declare(strict_types=1);

namespace App\Application\SuperMagic\Topic\DTO;

final readonly class TopicAgentConfig
{
    public function __construct(
        public string $topicMode,
        public string $agentCode,
    ) {
    }
}
