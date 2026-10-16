<?php

declare(strict_types=1);

namespace HyperfTest\Cases\Unit\Notification;

use App\Application\Notification\Contract\EventEnvelope;
use App\Application\Notification\Contract\NotificationEventPublisherInterface;
use App\Application\SuperMagic\Common\Share\Service\ShareNotificationAppService;
use App\Domain\Contact\Repository\Facade\MagicDepartmentUserRepositoryInterface;
use App\Domain\Contact\Service\MagicDepartmentUserDomainService;
use App\Domain\Contact\Service\MagicUserDomainService;
use App\Domain\SuperMagic\Common\Share\Entity\ResourceShareEntity;
use PHPUnit\Framework\TestCase;

/** @internal */
final class ShareNotificationAppServiceTest extends TestCase
{
    public function testAllTeamSharePublishesOnlyFirstRecipientSet(): void
    {
        $published = [];
        $publisher = $this->createMock(NotificationEventPublisherInterface::class);
        $publisher->expects(self::once())
            ->method('publish')
            ->willReturnCallback(function (EventEnvelope|array $envelope) use (&$published): array {
                self::assertInstanceOf(EventEnvelope::class, $envelope);
                $published[] = $envelope;
                return ['event_id' => $envelope->eventId, 'status' => 'pending', 'accepted' => true, 'duplicate' => false];
            });

        $users = $this->createMock(MagicUserDomainService::class);
        $users->method('getActiveUserIdsByOrganization')->willReturnOnConsecutiveCalls(
            ['user-a', 'user-b'],
            []
        );
        $users->method('getActiveUsersByIds')->willReturn([]);
        $departments = new MagicDepartmentUserDomainService(
            $this->createMock(MagicDepartmentUserRepositoryInterface::class)
        );
        $service = new ShareNotificationAppService($publisher, $users, $departments);

        $share = $this->share('project-1', 12, 'Project 1', 'all');
        $service->publishRecipientsAdded(null, $share);
        $service->publishRecipientsAdded($share, $share);

        self::assertCount(1, $published);
        self::assertSame('share.project.recipients_added', $published[0]->eventType);
        self::assertSame(['user-a', 'user-b'], array_map(
            static fn ($recipient): string => $recipient->userId,
            $published[0]->recipients
        ));
        self::assertSame(
            'share:ORG:project:project-1:12:user-a',
            $published[0]->recipients[0]->sourceEventKey
        );
        self::assertSame(['user-a', 'user-b'], $share->getExtra()['notification_recipient_user_ids']);
    }

    public function testUpdateWithNoNewRecipientsDoesNotPublishEvent(): void
    {
        $publisher = $this->createMock(NotificationEventPublisherInterface::class);
        $publisher->expects(self::never())->method('publish');
        $users = $this->createMock(MagicUserDomainService::class);
        $users->method('getActiveUserIdsByOrganization')->willReturnOnConsecutiveCalls(['user-a'], []);
        $users->method('getActiveUsersByIds')->willReturn([]);
        $service = new ShareNotificationAppService(
            $publisher,
            $users,
            new MagicDepartmentUserDomainService($this->createMock(MagicDepartmentUserRepositoryInterface::class))
        );

        $before = $this->share('file-1', 15, 'File 1', 'all');
        $before->setExtra(['notification_recipient_user_ids' => ['user-a']]);
        $after = $this->share('file-1', 15, 'File 1', 'all');
        $after->setExtra(['notification_recipient_user_ids' => ['user-a']]);

        $service->publishRecipientsAdded($before, $after);
        self::assertSame(['user-a'], $after->getExtra()['notification_recipient_user_ids']);
    }

    public function testRestoredShareStartsANewRecipientNotificationCycle(): void
    {
        $published = [];
        $publisher = $this->createMock(NotificationEventPublisherInterface::class);
        $publisher->expects(self::once())
            ->method('publish')
            ->willReturnCallback(function (EventEnvelope|array $envelope) use (&$published): array {
                self::assertInstanceOf(EventEnvelope::class, $envelope);
                $published[] = $envelope;
                return ['event_id' => $envelope->eventId, 'status' => 'pending', 'accepted' => true, 'duplicate' => false];
            });

        $users = $this->createMock(MagicUserDomainService::class);
        $users->method('getActiveUserIdsByOrganization')->willReturn(['user-a']);
        $users->method('getActiveUsersByIds')->willReturn([]);
        $service = new ShareNotificationAppService(
            $publisher,
            $users,
            new MagicDepartmentUserDomainService($this->createMock(MagicDepartmentUserRepositoryInterface::class))
        );

        $before = $this->share('project-1', 12, 'Project 1', 'all');
        $before->setExtra(['notification_recipient_user_ids' => ['user-a']]);
        $before->setDeletedAt('2026-10-16 10:00:00');
        $after = $this->share('project-1', 12, 'Project 1', 'all');

        $service->publishRecipientsAdded($before, $after);

        self::assertCount(1, $published);
        self::assertSame(['user-a'], array_map(
            static fn ($recipient): string => $recipient->userId,
            $published[0]->recipients
        ));
        self::assertSame(['user-a'], $after->getExtra()['notification_recipient_user_ids']);
    }

    public function testEmptyResourceNameFallsBackToResourceId(): void
    {
        $published = [];
        $publisher = $this->createMock(NotificationEventPublisherInterface::class);
        $publisher->expects(self::once())->method('publish')->willReturnCallback(
            function (EventEnvelope|array $envelope) use (&$published): array {
                self::assertInstanceOf(EventEnvelope::class, $envelope);
                $published[] = $envelope;
                return ['event_id' => '1', 'status' => 'pending', 'accepted' => true, 'duplicate' => false];
            }
        );
        $users = $this->createMock(MagicUserDomainService::class);
        $users->method('getActiveUserIdsByOrganization')->willReturnOnConsecutiveCalls(['user-a'], []);
        $users->method('getActiveUsersByIds')->willReturn([]);
        $service = new ShareNotificationAppService(
            $publisher,
            $users,
            new MagicDepartmentUserDomainService($this->createMock(MagicDepartmentUserRepositoryInterface::class))
        );

        $service->publishRecipientsAdded(null, $this->share('project-1', 12, '', 'all'));

        self::assertSame('project-1', $published[0]->payload['resource_name']);
        self::assertNotSame('', $published[0]->payload['sharer_name']);
    }

    public function testAllTeamShareSplitsLargeRecipientSetsIntoBoundedEvents(): void
    {
        $published = [];
        $publisher = $this->createMock(NotificationEventPublisherInterface::class);
        $publisher->expects(self::exactly(2))
            ->method('publish')
            ->willReturnCallback(function (EventEnvelope|array $envelope) use (&$published): array {
                self::assertInstanceOf(EventEnvelope::class, $envelope);
                $published[] = $envelope;
                return ['event_id' => $envelope->eventId, 'status' => 'pending', 'accepted' => true, 'duplicate' => false];
            });

        $firstBatch = array_map(static fn (int $id): string => 'user-' . $id, range(1, 500));
        $secondBatch = ['user-501'];
        $users = $this->createMock(MagicUserDomainService::class);
        $users->method('getActiveUserIdsByOrganization')->willReturnOnConsecutiveCalls($firstBatch, $secondBatch, []);
        $users->method('getActiveUsersByIds')->willReturn([]);
        $service = new ShareNotificationAppService(
            $publisher,
            $users,
            new MagicDepartmentUserDomainService($this->createMock(MagicDepartmentUserRepositoryInterface::class))
        );

        $share = $this->share('project-1', 12, 'Project 1', 'all');
        $service->publishRecipientsAdded(null, $share);

        self::assertCount(2, $published);
        self::assertCount(500, $published[0]->recipients);
        self::assertCount(1, $published[1]->recipients);
    }

    private function share(string $resourceId, int $resourceType, string $name, string $range): ResourceShareEntity
    {
        $share = new ResourceShareEntity([
            'id' => $resourceType,
            'resource_id' => $resourceId,
            'resource_type' => $resourceType,
            'resource_name' => $name,
            'organization_code' => 'ORG',
            'created_uid' => 'owner',
            'share_type' => 2,
            'share_range' => $range,
        ]);
        return $share;
    }

}
