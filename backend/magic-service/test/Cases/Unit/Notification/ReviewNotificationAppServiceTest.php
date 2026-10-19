<?php

declare(strict_types=1);

namespace HyperfTest\Cases\Unit\Notification;

use App\Application\Notification\Contract\EventEnvelope;
use App\Application\Notification\Contract\NotificationEventPublisherInterface;
use App\Application\Notification\Strategy\DefaultNotificationCatalogStrategy;
use App\Application\Notification\Validator\NotificationEventEnvelopeValidator;
use App\Application\SuperMagic\Review\Service\ReviewNotificationAppService;
use App\Domain\SuperMagic\Agent\Entity\AgentVersionEntity;
use App\Domain\SuperMagic\Skill\Entity\SkillVersionEntity;
use App\Domain\Notification\Service\NotificationEventTypeRegistry;
use PHPUnit\Framework\TestCase;

/** @internal */
final class ReviewNotificationAppServiceTest extends TestCase
{
    public function testAgentApprovalPublishesVersionedEventToCreator(): void
    {
        $published = [];
        $publisher = $this->createMock(NotificationEventPublisherInterface::class);
        $publisher->expects(self::once())->method('publish')->willReturnCallback(
            function (EventEnvelope|array $envelope) use (&$published): array {
                self::assertInstanceOf(EventEnvelope::class, $envelope);
                (new NotificationEventEnvelopeValidator(
                    new NotificationEventTypeRegistry(new DefaultNotificationCatalogStrategy())
                ))->validate($envelope);
                $published[] = $envelope;
                return ['event_id' => $envelope->eventId, 'status' => 'pending', 'accepted' => true, 'duplicate' => false];
            }
        );
        $version = $this->createMock(AgentVersionEntity::class);
        $version->method('getCode')->willReturn('agent-code');
        $version->method('getName')->willReturn('分析助手');
        $version->method('getId')->willReturn(2002);
        $version->method('getVersion')->willReturn('2.0.0');
        $version->method('getOrganizationCode')->willReturn('ORG');
        $version->method('getCreator')->willReturn('user-1');

        (new ReviewNotificationAppService($publisher))->publishAgentApproved($version, '1001');

        self::assertSame('review.agent.version_approved', $published[0]->eventType);
        self::assertSame('review:ORG:agent:1001:2002:user-1:approved', $published[0]->recipients[0]->sourceEventKey);
        self::assertSame('1001', $published[0]->payload['resource_id']);
        self::assertSame('2002', $published[0]->payload['version_id']);
    }

    public function testSkillApprovalPublishesFallbackNameAndStableKey(): void
    {
        $published = [];
        $publisher = $this->createMock(NotificationEventPublisherInterface::class);
        $publisher->expects(self::once())->method('publish')->willReturnCallback(
            function (EventEnvelope|array $envelope) use (&$published): array {
                $published[] = $envelope;
                return ['event_id' => '1', 'status' => 'pending', 'accepted' => true, 'duplicate' => false];
            }
        );
        $version = $this->createMock(SkillVersionEntity::class);
        $version->method('getCode')->willReturn('skill-code');
        $version->method('getNameI18n')->willReturn(['en' => 'Web Search']);
        $version->method('getPackageName')->willReturn('web-search');
        $version->method('getId')->willReturn(3003);
        $version->method('getVersion')->willReturn('1.2.0');
        $version->method('getOrganizationCode')->willReturn('ORG');
        $version->method('getCreatorId')->willReturn('user-2');

        (new ReviewNotificationAppService($publisher))->publishSkillApproved($version, '1002');

        self::assertSame('review.skill.version_approved', $published[0]->eventType);
        self::assertSame('Web Search', $published[0]->payload['resource_name']);
        self::assertSame('review:ORG:skill:1002:3003:user-2:approved', $published[0]->recipients[0]->sourceEventKey);
    }
}
