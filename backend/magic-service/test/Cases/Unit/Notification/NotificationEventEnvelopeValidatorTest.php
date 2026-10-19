<?php

declare(strict_types=1);

/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Unit\Notification;

use App\Application\Notification\Strategy\DefaultNotificationCatalogStrategy;
use App\Application\Notification\Validator\NotificationEventEnvelopeValidator;
use App\Domain\Notification\Service\NotificationEventTypeRegistry;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

/** @internal */
final class NotificationEventEnvelopeValidatorTest extends TestCase
{
    private NotificationEventEnvelopeValidator $validator;

    protected function setUp(): void
    {
        $this->validator = new NotificationEventEnvelopeValidator(
            new NotificationEventTypeRegistry(new DefaultNotificationCatalogStrategy())
        );
    }

    public function testValidEnvelopeIsAccepted(): void
    {
        $data = $this->validator->validate($this->envelope());

        self::assertSame('task.finished', $data['event_type']);
        self::assertCount(1, $data['recipients']);
    }

    public function testDuplicateRecipientsAreRejected(): void
    {
        $envelope = $this->envelope();
        $envelope['recipients'][] = $envelope['recipients'][0];

        $this->expectException(InvalidArgumentException::class);
        $this->validator->validate($envelope);
    }

    public function testWithdrawalCanHaveNoRecipients(): void
    {
        $envelope = $this->envelope();
        $envelope['event_type'] = 'share.project.withdrawn';
        $envelope['source']['domain'] = 'share';
        $envelope['recipients'] = [];

        self::assertSame([], $this->validator->validate($envelope)['recipients']);
    }

    public function testUnknownEventIsRejectedBeforePersistence(): void
    {
        $envelope = $this->envelope();
        $envelope['event_type'] = 'payment.succeeded';
        $envelope['source']['domain'] = 'payment';

        $this->expectException(InvalidArgumentException::class);
        $this->validator->validate($envelope);
    }

    public function testEveryPublicEventHasAValidEnvelopeShape(): void
    {
        $strategy = new DefaultNotificationCatalogStrategy();
        foreach ($strategy->eventTypes() as $eventType) {
            $envelope = $this->envelope();
            $envelope['event_type'] = $eventType;
            $envelope['source']['domain'] = explode('.', $eventType, 2)[0];
            $envelope['source']['type'] = 'business_fact';
            if (str_ends_with($eventType, '.withdrawn')) {
                $envelope['recipients'] = [];
            } else {
                $envelope['recipients'][0]['source_event_key'] = $this->sourceEventKeyFor($eventType);
            }

            self::assertSame($eventType, $this->validator->validate($envelope)['event_type']);
        }
    }

    /** @return array<string, mixed> */
    private function envelope(): array
    {
        return [
            'event_id' => '785205968218931200',
            'event_type' => 'task.finished',
            'occurred_at' => '2026-09-29 10:00:00',
            'producer' => 'super_magic',
            'organization_code' => 'MAGIC',
            'source' => [
                'domain' => 'task',
                'type' => 'task',
                'id' => '785205968218931201',
            ],
            'recipients' => [[
                'user_id' => '785205968218931202',
                'source_event_key' => 'task:MAGIC:785205968218931201:785205968218931202:finished',
                'payload' => ['task_name' => 'Weekly report'],
            ]],
            'payload' => ['status' => 'finished'],
            'schema_version' => 1,
        ];
    }

    private function sourceEventKeyFor(string $eventType): string
    {
        return match (true) {
            $eventType === 'task.finished' => 'task:MAGIC:785205968218931201:785205968218931202:finished',
            $eventType === 'task.error' => 'task:MAGIC:785205968218931201:785205968218931202:error',
            $eventType === 'share.project.recipients_added' => 'share:MAGIC:project:785205968218931201:785205968218931203:785205968218931202',
            $eventType === 'share.file.recipients_added' => 'share:MAGIC:file:785205968218931201:785205968218931203:785205968218931202',
            $eventType === 'review.skill.version_approved' => 'review:MAGIC:skill:785205968218931201:785205968218931203:785205968218931202:approved',
            $eventType === 'review.agent.version_approved' => 'review:MAGIC:agent:785205968218931201:785205968218931203:785205968218931202:approved',
            default => 'task:MAGIC:785205968218931201:785205968218931202:finished',
        };
    }
}
