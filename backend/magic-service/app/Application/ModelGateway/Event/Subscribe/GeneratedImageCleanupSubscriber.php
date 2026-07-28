<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\ModelGateway\Event\Subscribe;

use App\Domain\File\Repository\Persistence\CloudFileRepository;
use App\Domain\File\Service\FileCleanupDomainService;
use App\Domain\File\Service\FileDomainService;
use App\Domain\ModelGateway\Event\ImageGeneratedEvent;
use App\Domain\ModelGateway\Event\ImageOperationCompletedEvent;
use App\Infrastructure\Core\ValueObject\StorageBucketType;
use App\Infrastructure\Util\File\EasyFileTools;
use Dtyq\AsyncEvent\Kernel\Annotation\AsyncListener;
use Hyperf\Event\Annotation\Listener;
use Hyperf\Event\Contract\ListenerInterface;
use Psr\Log\LoggerInterface;
use Throwable;

#[AsyncListener(driver: 'coroutine')]
#[Listener]
/**
 * 监听图片生成与图片处理完成事件，为 Magic 自有文件登记延迟清理任务。
 */
class GeneratedImageCleanupSubscriber implements ListenerInterface
{
    public function __construct(
        private readonly FileCleanupDomainService $fileCleanupDomainService,
        private readonly FileDomainService $fileDomainService,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function listen(): array
    {
        return [
            ImageGeneratedEvent::class,
            ImageOperationCompletedEvent::class,
        ];
    }

    public function process(object $event): void
    {
        if (! $event instanceof ImageGeneratedEvent && ! $event instanceof ImageOperationCompletedEvent) {
            return;
        }

        $expireSeconds = (int) config('image_generate.file_cleanup.expire_seconds', 86400);
        if ($expireSeconds <= 0) {
            return;
        }

        $organizationCode = $event->getOrganizationCode();
        $sourceId = $event->getSourceId() ?? $event->getTaskId() ?? $event->getTopicId();
        foreach ($this->extractOwnedFileKeys($organizationCode, $event->getGeneratedImages()) as $fileKey) {
            try {
                $this->fileCleanupDomainService->registerFileForCleanup(
                    $organizationCode,
                    $fileKey,
                    basename($fileKey),
                    0,
                    'image_generate',
                    $sourceId,
                    $expireSeconds,
                    StorageBucketType::Public->value
                );
            } catch (Throwable $throwable) {
                // 清理登记失败不应影响已经成功的图片接口。
                $this->logger->error('Failed to register generated image cleanup record', [
                    'organization_code' => $organizationCode,
                    'file_key' => $fileKey,
                    'source_id' => $sourceId,
                    'error' => $throwable->getMessage(),
                ]);
            }
        }
    }

    private function extractOwnedFileKeys(string $organizationCode, array $images): array
    {
        $fileKeys = [];
        foreach ($images as $image) {
            $url = $image['url'];
            try {
                $fileKey = $this->resolveOwnedPublicFileKey($organizationCode, $url);
            } catch (Throwable $throwable) {
                $this->logger->error('Failed to verify generated image file ownership', [
                    'organization_code' => $organizationCode,
                    'url' => $url,
                    'error' => $throwable->getMessage(),
                ]);
                continue;
            }

            if ($fileKey !== null) {
                $fileKeys[$fileKey] = true;
            }
        }

        return array_keys($fileKeys);
    }

    private function resolveOwnedPublicFileKey(string $organizationCode, string $url): ?string
    {
        // 仅处理当前组织或共享 MAGIC 组织下的文件。
        $fileKey = EasyFileTools::formatPath($url);
        $fileOrganizationCode = explode('/', $fileKey, 2)[0];
        if (! in_array($fileOrganizationCode, [
            $organizationCode,
            CloudFileRepository::DEFAULT_ICON_ORGANIZATION_CODE,
        ], true)) {
            return null;
        }

        $urlHost = parse_url($url, PHP_URL_HOST);
        if (! is_string($urlHost) || $urlHost === '') {
            return $fileKey;
        }

        // 对比官方文件链接的 Host，避免第三方 URL 伪造文件路径后被误删。
        $fileLink = $this->fileDomainService->getLink(
            $fileOrganizationCode,
            $fileKey,
            StorageBucketType::Public
        );
        $ownedFileHost = parse_url((string) $fileLink?->getUrl(), PHP_URL_HOST);

        return is_string($ownedFileHost) && strtolower($ownedFileHost) === strtolower($urlHost)
            ? $fileKey
            : null;
    }
}
