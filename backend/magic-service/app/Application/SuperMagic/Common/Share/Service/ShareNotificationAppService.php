<?php

declare(strict_types=1);

namespace App\Application\SuperMagic\Common\Share\Service;

use App\Application\Notification\Contract\EventEnvelope;
use App\Application\Notification\Contract\EventRecipient;
use App\Application\Notification\Contract\EventSource;
use App\Application\Notification\Contract\NotificationEventPublisherInterface;
use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Domain\Contact\Service\MagicDepartmentUserDomainService;
use App\Domain\Contact\Service\MagicUserDomainService;
use App\Domain\SuperMagic\Common\Share\Constant\ResourceType;
use App\Domain\SuperMagic\Common\Share\Constant\ShareAccessType;
use App\Domain\SuperMagic\Common\Share\Entity\ResourceShareEntity;
use App\Infrastructure\Util\IdGenerator\IdGenerator;

/** 将项目、文件团队分享转换为统一站内信事件。 */
final readonly class ShareNotificationAppService
{
    private const RECIPIENT_SNAPSHOT = 'notification_recipient_user_ids';

    public function __construct(
        private NotificationEventPublisherInterface $publisher,
        private MagicUserDomainService $users,
        private MagicDepartmentUserDomainService $departmentUsers,
    ) {
    }

    /**
     * 在分享保存成功后发布本次新增收件人事件。
     */
    public function publishRecipientsAdded(
        ?ResourceShareEntity $before,
        ResourceShareEntity $after,
        string $sharerName = ''
    ): void {
        $eventType = $this->addedEventType($after);
        if ($eventType === null || $after->getShareType() !== ShareAccessType::TeamShare->value) {
            return;
        }

        $currentRecipients = $this->resolveRecipients($after);
        if ($currentRecipients === []) {
            return;
        }

        // A soft-deleted share starts a new notification cycle when it is
        // restored. Do not carry the previous cycle's recipient snapshot into
        // the new share, otherwise re-sharing to the same user is treated as
        // an already-notified recipient and no event is published.
        $previous = $before !== null && $before->getDeletedAt() !== null
            ? []
            : $this->snapshot($before ?? $after);
        $newRecipients = array_values(array_diff($currentRecipients, $previous));

        // 无新增收件人时不产生事件，但保留历史快照，便于后续配置变更继续计算差集。
        $mergedSnapshot = array_values(array_unique(array_merge($previous, $currentRecipients)));
        if ($after->getExtra() === null || $mergedSnapshot !== $previous) {
            $extra = $after->getExtra() ?? [];
            $extra[self::RECIPIENT_SNAPSHOT] = $mergedSnapshot;
            $after->setExtra($extra);
        }

        if ($newRecipients === []) {
            return;
        }

        $kind = $this->resourceKind($after);
        $payload = [
            'share_id' => (string) $after->getId(),
            'resource_name' => $after->getResourceName(),
            'share_scope' => $after->getShareRange() === 'all' ? '全员' : '指定成员/部门',
            'sharer_name' => $sharerName !== '' ? $sharerName : $this->resolveSharerName($after),
            'resource_id' => $after->getResourceId(),
            'resource_type' => $kind,
        ];
        $recipients = [];
        foreach ($newRecipients as $userId) {
            $recipients[] = new EventRecipient(
                $userId,
                sprintf('share:%s:%s:%s:%s', $after->getOrganizationCode(), $kind, $after->getResourceId(), $userId),
            );
        }

        $this->publisher->publish(new EventEnvelope(
            eventId: (string) IdGenerator::getSnowId(),
            eventType: $eventType,
            occurredAt: date('Y-m-d H:i:s'),
            producer: 'super_magic.share',
            organizationCode: $after->getOrganizationCode(),
            source: new EventSource('share', $kind, $after->getResourceId()),
            recipients: $recipients,
            payload: $payload,
        ));
    }

    /** 在分享撤回成功后发布撤回事件。 */
    public function publishWithdrawn(ResourceShareEntity $share): void
    {
        $eventType = $this->withdrawnEventType($share);
        if ($eventType === null || $share->getShareType() !== ShareAccessType::TeamShare->value) {
            return;
        }

        $kind = $this->resourceKind($share);
        $this->publisher->publish(new EventEnvelope(
            eventId: (string) IdGenerator::getSnowId(),
            eventType: $eventType,
            occurredAt: date('Y-m-d H:i:s'),
            producer: 'super_magic.share',
            organizationCode: $share->getOrganizationCode(),
            source: new EventSource('share', $kind, $share->getResourceId()),
            recipients: [],
            payload: ['resource_id' => $share->getResourceId(), 'resource_type' => $kind],
        ));
    }

    /** @return list<string> */
    private function resolveRecipients(ResourceShareEntity $share): array
    {
        $organizationCode = $share->getOrganizationCode();
        $userIds = [];
        $activeUsers = $this->users->getActiveUsersByOrganization($organizationCode);
        if ($share->getShareRange() === 'all') {
            $userIds = array_keys($activeUsers);
        } elseif ($share->getShareRange() === 'designated') {
            $userTargetIds = [];
            $departmentIds = [];
            foreach ($share->getTargetIdsArray() as $target) {
                $type = strtolower((string) ($target['target_type'] ?? ''));
                $id = trim((string) ($target['target_id'] ?? ''));
                if ($id === '') {
                    continue;
                }
                if ($type === 'user') {
                    $userTargetIds[] = $id;
                } elseif ($type === 'department') {
                    $departmentIds[] = $id;
                }
            }
            $userIds = $userTargetIds;
            if ($departmentIds !== []) {
                foreach ($this->departmentUsers->getDepartmentUsersByDepartmentIds(
                    array_values(array_unique($departmentIds)),
                    DataIsolation::create($organizationCode),
                    100000,
                    ['user_id', 'organization_code', 'deleted_at']
                ) as $departmentUser) {
                    if ($departmentUser->getOrganizationCode() === $organizationCode) {
                        $userIds[] = $departmentUser->getUserId();
                    }
                }
            }
            $userIds = array_values(array_intersect(array_unique($userIds), array_keys($activeUsers)));
        }
        return array_values(array_unique(array_filter(array_map('strval', $userIds))));
    }

    /** @return list<string> */
    private function snapshot(ResourceShareEntity $share): array
    {
        $extra = $share->getExtra() ?? [];
        return array_values(array_unique(array_map('strval', (array) ($extra[self::RECIPIENT_SNAPSHOT] ?? []))));
    }

    private function resourceKind(ResourceShareEntity $share): ?string
    {
        return match ($share->getResourceTypeEnum()) {
            ResourceType::Project => 'project',
            ResourceType::File, ResourceType::FileCollection => 'file',
            default => null,
        };
    }

    private function addedEventType(ResourceShareEntity $share): ?string
    {
        return match ($this->resourceKind($share)) {
            'project' => 'share.project.recipients_added',
            'file' => 'share.file.recipients_added',
            default => null,
        };
    }

    private function withdrawnEventType(ResourceShareEntity $share): ?string
    {
        return match ($this->resourceKind($share)) {
            'project' => 'share.project.withdrawn',
            'file' => 'share.file.withdrawn',
            default => null,
        };
    }

    private function resolveSharerName(ResourceShareEntity $share): string
    {
        $users = $this->users->getActiveUsersByOrganization($share->getOrganizationCode());
        return ($users[$share->getCreatedUid()] ?? null)?->getNickname() ?? $share->getCreatedUid();
    }
}
