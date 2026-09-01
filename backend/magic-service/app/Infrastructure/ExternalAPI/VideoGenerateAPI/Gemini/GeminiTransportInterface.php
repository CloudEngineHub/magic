<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI\Gemini;

use App\Domain\ModelGateway\Entity\ValueObject\QueueExecutorConfig;

interface GeminiTransportInterface
{
    public function createInteraction(QueueExecutorConfig $config, array $payload, array $logContext = []): array;

    public function getInteraction(QueueExecutorConfig $config, string $interactionId, array $logContext = []): array;

    /** @return array{bytes_base64_encoded: string, mime_type: string} */
    public function downloadMedia(QueueExecutorConfig $config, string $uri, array $logContext = []): array;
}
