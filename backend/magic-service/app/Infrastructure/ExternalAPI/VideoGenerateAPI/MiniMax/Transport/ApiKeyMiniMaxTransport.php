<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI\MiniMax\Transport;

use App\Domain\ModelGateway\Entity\ValueObject\QueueExecutorConfig;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\MiniMax\MiniMaxVideoClient;

readonly class ApiKeyMiniMaxTransport
{
    public function __construct(private MiniMaxVideoClient $client)
    {
    }

    public function submit(QueueExecutorConfig $config, array $payload): array
    {
        return $this->client->request('POST', $config->getBaseUrl(), $config->getApiKey(), '/v2/video_generation', $payload);
    }

    public function query(QueueExecutorConfig $config, string $taskId): array
    {
        return $this->client->request(
            'GET',
            $config->getBaseUrl(),
            $config->getApiKey(),
            '/v2/query/video_generation/' . rawurlencode($taskId),
            [],
        );
    }
}
