<?php

declare(strict_types=1);

namespace App\Application\SuperMagic\Review\Service;

use App\Application\Notification\Contract\EventEnvelope;
use App\Application\Notification\Contract\EventRecipient;
use App\Application\Notification\Contract\EventSource;
use App\Application\Notification\Contract\NotificationEventPublisherInterface;
use App\Domain\SuperMagic\Agent\Entity\AgentVersionEntity;
use App\Domain\SuperMagic\Skill\Entity\SkillVersionEntity;
use App\Infrastructure\Util\IdGenerator\IdGenerator;

/** 将 Agent/Skill 审核通过结果转换为统一站内信事件。 */
final readonly class ReviewNotificationAppService
{
    public function __construct(
        private NotificationEventPublisherInterface $publisher,
    ) {
    }

    public function publishAgentApproved(AgentVersionEntity $version, ?string $resourceId = null): void
    {
        $this->publish(
            eventType: 'review.agent.version_approved',
            resourceType: 'agent',
            resourceId: $resourceId ?: (string) ($version->getId() ?? ''),
            resourceName: $version->getName(),
            versionId: (string) ($version->getId() ?? ''),
            versionName: $version->getVersion(),
            organizationCode: $version->getOrganizationCode(),
            recipientUserId: $version->getCreator(),
        );
    }

    public function publishSkillApproved(SkillVersionEntity $version, ?string $resourceId = null): void
    {
        $nameI18n = $version->getNameI18n();
        $resourceName = (string) ($nameI18n['zh'] ?? $nameI18n['en'] ?? $version->getPackageName());
        $this->publish(
            eventType: 'review.skill.version_approved',
            resourceType: 'skill',
            resourceId: $resourceId ?: (string) ($version->getId() ?? ''),
            resourceName: $resourceName,
            versionId: (string) ($version->getId() ?? ''),
            versionName: $version->getVersion(),
            organizationCode: $version->getOrganizationCode(),
            recipientUserId: $version->getCreatorId(),
        );
    }

    private function publish(
        string $eventType,
        string $resourceType,
        string $resourceId,
        string $resourceName,
        string $versionId,
        string $versionName,
        string $organizationCode,
        string $recipientUserId,
    ): void {
        if ($resourceId === '' || $versionId === '' || $organizationCode === '' || $recipientUserId === '') {
            return;
        }

        $sourceEventKey = sprintf(
            'review:%s:%s:%s:%s:%s:approved',
            $organizationCode,
            $resourceType,
            $resourceId,
            $versionId,
            $recipientUserId
        );
        $payload = [
            'review_id' => $versionId,
            'resource_id' => $resourceId,
            'resource_name' => $resourceName,
            'version_id' => $versionId,
            'version_name' => $versionName,
        ];

        $this->publisher->publish(new EventEnvelope(
            eventId: (string) IdGenerator::getSnowId(),
            eventType: $eventType,
            occurredAt: date('Y-m-d H:i:s'),
            producer: 'super_magic.review',
            organizationCode: $organizationCode,
            source: new EventSource('review', $resourceType, $resourceId, $versionId),
            recipients: [new EventRecipient($recipientUserId, $sourceEventKey)],
            payload: $payload,
        ));
    }
}
