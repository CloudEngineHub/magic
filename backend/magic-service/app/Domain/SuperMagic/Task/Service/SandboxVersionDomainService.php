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
            return $this->buildSandboxVersionResult(null, []);
        }

        return $this->buildSandboxVersionResult(
            $topicEntity->getSandboxImages(),
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

        $latestImage = $this->getLatestImages();
        $needUpgradeMap = [];
        foreach ($topics as $topic) {
            $versionResult = $this->buildSandboxVersionResult(
                $topic->getSandboxId() === '' ? null : $topic->getSandboxImages(),
                $latestImage
            );
            $needUpgradeMap[$topic->getId()] = $versionResult['needs_update'];
        }

        return $needUpgradeMap;
    }

    /**
     * @return array{current_version: string, latest_version: string, needs_update: null|bool}
     */
    private function buildSandboxVersionResult(?array $currentImages, array $latestImages): array
    {
        $needsUpdate = null;
        if ($this->hasCompleteImages($currentImages) && $this->hasCompleteImages($latestImages)) {
            $needsUpdate = $currentImages['agent_image'] !== $latestImages['agent_image']
                || $currentImages['agfs_image'] !== $latestImages['agfs_image'];
        }
        return [
            'current_version' => self::extractImageVersion($currentImages['agent_image'] ?? ''),
            'latest_version' => self::extractImageVersion($latestImages['agent_image'] ?? ''),
            'needs_update' => $needsUpdate,
        ];
    }

    private function hasCompleteImages(?array $images): bool
    {
        return is_string($images['agent_image'] ?? null) && trim($images['agent_image']) !== ''
            && is_string($images['agfs_image'] ?? null) && trim($images['agfs_image']) !== '';
    }

    private function getLatestImages(): array
    {
        try {
            return $this->agentDomainService->getLatestImages();
        } catch (Throwable $e) {
            $this->logger->warning('[Sandbox][Version] Failed to fetch latest images', ['error' => $e->getMessage()]);
            return [];
        }
    }

    /** Display only; comparisons always use complete image references. */
    private static function extractImageVersion(mixed $image): string
    {
        if (! is_string($image) || $image === '') {
            return '';
        }
        $name = substr($image, (strrpos($image, '/') ?: -1) + 1);
        $tagPos = strpos($name, ':');
        return $tagPos === false ? $name : substr($name, $tagPos + 1);
    }
}
