<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\Volcengine;

use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Model\Volcengine\VolcengineAPI;
use Hyperf\Codec\Json;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;
use Throwable;

class VolcengineVisualAsyncClient
{
    private const MAX_RETRY_COUNT = 30;

    private const RETRY_INTERVAL = 2;

    private LoggerInterface $logger;

    private VolcengineAPI $api;

    public function __construct(
        string $ak,
        string $sk,
        LoggerFactory $loggerFactory,
    ) {
        $this->api = new VolcengineAPI($ak, $sk);
        $this->logger = $loggerFactory->get(static::class);
    }

    /**
     * @param array<string, mixed> $body
     * @return array<string, mixed>
     */
    public function submitTask(array $body): array
    {
        try {
            $response = $this->api->submitTask($body);
            if (($response['code'] ?? null) !== 10000) {
                throw new VolcengineVisualAsyncClientException(
                    (string) ($response['message'] ?? 'Volcengine submit task failed'),
                    (int) ($response['code'] ?? 0)
                );
            }
            return $response;
        } catch (VolcengineVisualAsyncClientException $exception) {
            throw $exception;
        } catch (Throwable $throwable) {
            $this->logger->error('VolcengineVisualAsyncClientSubmitTaskException', [
                'error' => $throwable->getMessage(),
                'payload' => $body,
            ]);
            throw new VolcengineVisualAsyncClientException($throwable->getMessage());
        }
    }

    /**
     * @param array<string, mixed> $reqJson
     * @return array<string, mixed>
     */
    public function pollTaskResult(string $taskId, string $reqKey, array $reqJson = []): array
    {
        $retryCount = 0;
        $reqJsonString = Json::encode($reqJson);

        while ($retryCount < self::MAX_RETRY_COUNT) {
            try {
                $response = $this->api->getTaskResult([
                    'task_id' => $taskId,
                    'req_key' => $reqKey,
                    'req_json' => $reqJsonString,
                ]);

                if (($response['code'] ?? null) !== 10000) {
                    throw new VolcengineVisualAsyncClientException(
                        (string) ($response['message'] ?? 'Volcengine get task result failed'),
                        (int) ($response['code'] ?? 0)
                    );
                }

                $status = (string) ($response['data']['status'] ?? '');
                switch ($status) {
                    case 'done':
                        return $response;
                    case 'in_queue':
                    case 'generating':
                        ++$retryCount;
                        sleep(self::RETRY_INTERVAL);
                        continue 2;
                    case 'not_found':
                    case 'expired':
                        throw new VolcengineVisualAsyncClientException(
                            (string) ($response['message'] ?? "Volcengine task {$status}"),
                            (int) ($response['code'] ?? 0)
                        );
                    default:
                        throw new VolcengineVisualAsyncClientException('Unknown Volcengine task status: ' . $status);
                }
            } catch (VolcengineVisualAsyncClientException $exception) {
                throw $exception;
            } catch (Throwable $throwable) {
                $this->logger->error('VolcengineVisualAsyncClientPollTaskResultException', [
                    'error' => $throwable->getMessage(),
                    'task_id' => $taskId,
                    'req_key' => $reqKey,
                ]);
                throw new VolcengineVisualAsyncClientException($throwable->getMessage());
            }
        }

        throw new VolcengineVisualAsyncClientException('Volcengine task polling timeout');
    }
}
