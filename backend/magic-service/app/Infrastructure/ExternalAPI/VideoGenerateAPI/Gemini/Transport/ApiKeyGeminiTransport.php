<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI\Gemini\Transport;

use App\Domain\ModelGateway\Entity\ValueObject\QueueExecutorConfig;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\Gemini\GeminiTransportInterface;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\Gemini\GeminiVideoClient;

readonly class ApiKeyGeminiTransport implements GeminiTransportInterface
{
    public function __construct(private GeminiVideoClient $client)
    {
    }

    public function createInteraction(QueueExecutorConfig $config, array $payload, array $logContext = []): array
    {
        return $this->client->post(
            $config->getBaseUrl(),
            $config->getApiKey(),
            '',
            $payload,
            $logContext,
            $config->getExtraString('proxy_url'),
        );
    }

    public function getInteraction(QueueExecutorConfig $config, string $interactionId, array $logContext = []): array
    {
        return $this->client->get(
            $config->getBaseUrl(),
            $config->getApiKey(),
            '/' . rawurlencode($interactionId),
            $logContext,
            $config->getExtraString('proxy_url'),
        );
    }
}
