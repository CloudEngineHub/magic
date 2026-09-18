<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Task\Service;

use App\Domain\SuperMagic\Topic\Service\TopicDomainService;
use App\ErrorCode\SuperAgentErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;
use Throwable;

readonly class SandboxVersionDomainService
{
    private LoggerInterface $logger;

    public function __construct(
        private TopicDomainService $topicDomainService,
        private AgentDomainService $agentDomainService,
        LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory->get('sandbox');
    }

    /**
     * Check recorded images against the current release standard.
     * $useCache is retained for call compatibility; standards are fetched per request.
     *
     * @return array{current_version: string, latest_version: string, needs_update: null|bool}
     */
    public function checkSandboxVersion(int $topicId, bool $useCache = true, string $effectiveSandboxId = ''): array
    {
        $topicEntity = $this->topicDomainService->getTopicById($topicId);
        if (! $topicEntity) {
            ExceptionBuilder::throw(SuperAgentErrorCode::TOPIC_NOT_FOUND, 'topic.topic_not_found');
        }

        // 持久化映射为空时，仅接受与 topic_id 完全一致的 legacy 沙箱身份。
        if ($topicEntity->getSandboxId() === '' && $effectiveSandboxId !== (string) $topicId) {
            return $this->buildSandboxVersionResult(null, null, []);
        }

        return $this->buildSandboxVersionResult(
            $topicEntity->getSandboxImages(),
            $topicEntity->getAgentImage(),
            $this->getLatestImages()
        );
    }

    /**
     * Compare a batch against one release standard without caching.
     *
     * @param int[] $topicIds
     * @return array<int, null|bool> topicId => needUpgrade
     */
    public function checkNeedUpgradeByTopicIds(array $topicIds, bool $useCache = true): array
    {
        $topicIds = array_values(array_unique(array_filter(
            array_map('intval', $topicIds),
            static fn (int $topicId) => $topicId > 0
        )));
        if (empty($topicIds)) {
            return [];
        }

        $topics = $this->topicDomainService->getTopicsByIds($topicIds);
        if (empty($topics)) {
            return [];
        }

        $latestImages = $this->getLatestImages();
        $needUpgradeMap = [];
        foreach ($topics as $topic) {
            $hasSandbox = $topic->getSandboxId() !== '';
            $versionResult = $this->buildSandboxVersionResult(
                $hasSandbox ? $topic->getSandboxImages() : null,
                $hasSandbox ? $topic->getAgentImage() : null,
                $latestImages
            );
            $needUpgradeMap[$topic->getId()] = $versionResult['needs_update'];
        }

        return $needUpgradeMap;
    }

    /**
     * Historical rows may not have the AGFS image. A known Agent mismatch is
     * still sufficient to require an upgrade, while an Agent match remains
     * unknown because the historical AGFS version cannot be inferred.
     *
     * @param null|array<string, mixed> $currentImages
     * @param array<string, mixed> $latestImages
     * @return array{current_version: string, latest_version: string, needs_update: null|bool}
     */
    private function buildSandboxVersionResult(
        ?array $currentImages,
        ?string $legacyAgentImage,
        array $latestImages
    ): array {
        $needsUpdate = null;
        if ($this->hasCompleteImages($latestImages)) {
            if ($this->hasCompleteImages($currentImages)) {
                $needsUpdate = $currentImages['agent_image'] !== $latestImages['agent_image']
                    || $currentImages['agfs_image'] !== $latestImages['agfs_image'];
            } else {
                $knownAgentImage = $this->nonEmptyImage($currentImages['agent_image'] ?? null)
                    ?? $this->nonEmptyImage($legacyAgentImage);
                if ($knownAgentImage !== null && $knownAgentImage !== $latestImages['agent_image']) {
                    $needsUpdate = true;
                }
            }
        }

        $currentAgentImage = $this->nonEmptyImage($currentImages['agent_image'] ?? null)
            ?? $this->nonEmptyImage($legacyAgentImage)
            ?? '';

        return [
            'current_version' => self::extractImageVersion($currentAgentImage),
            'latest_version' => self::extractImageVersion($latestImages['agent_image'] ?? ''),
            'needs_update' => $needsUpdate,
        ];
    }

    /** @param null|array<string, mixed> $images */
    private function hasCompleteImages(?array $images): bool
    {
        return $this->nonEmptyImage($images['agent_image'] ?? null) !== null
            && $this->nonEmptyImage($images['agfs_image'] ?? null) !== null;
    }

    private function nonEmptyImage(mixed $image): ?string
    {
        return is_string($image) && trim($image) !== '' ? $image : null;
    }

    /** @return array<string, mixed> */
    private function getLatestImages(): array
    {
        try {
            return $this->agentDomainService->getLatestImages();
        } catch (Throwable $e) {
            $this->logger->warning('[Sandbox][Version] Failed to fetch latest images', [
                'error' => $e->getMessage(),
            ]);
            return [];
        }
    }

    /** Display only; comparisons always use complete image references. */
    private static function extractImageVersion(mixed $image): string
    {
        if (! is_string($image) || $image === '') {
            return '';
        }

        $imageWithoutDigest = explode('@', $image, 2)[0];
        $lastSlashPos = strrpos($imageWithoutDigest, '/');
        $tagPos = strrpos($imageWithoutDigest, ':');
        if ($tagPos === false || ($lastSlashPos !== false && $tagPos < $lastSlashPos)) {
            return '';
        }

        return substr($imageWithoutDigest, $tagPos + 1);
    }
}
