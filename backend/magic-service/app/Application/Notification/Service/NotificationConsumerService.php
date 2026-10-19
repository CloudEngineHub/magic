<?php

declare(strict_types=1);

/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Notification\Service;

use App\Application\Notification\Contract\EventEnvelope;
use App\Application\Notification\Validator\NotificationEventEnvelopeValidator;
use App\Domain\Notification\Constant\NotificationActionStatus;
use App\Domain\Notification\Constant\NotificationCategory;
use App\Domain\Notification\Constant\NotificationEventType;
use App\Domain\Notification\Constant\NotificationMessageStatus;
use App\Domain\Notification\Constant\NotificationType;
use App\Domain\Notification\Entity\NotificationEntity;
use App\Domain\Notification\Entity\NotificationEventEntity;
use App\Domain\Notification\Entity\ValueObject\NotificationDataIsolation;
use App\Domain\Notification\Repository\Facade\NotificationEventRepositoryInterface;
use App\Domain\Notification\Repository\Facade\NotificationRepositoryInterface;
use App\Domain\Notification\Repository\Facade\NotificationTemplateRepositoryInterface;
use Hyperf\DbConnection\Db;
use Hyperf\Logger\LoggerFactory;
use InvalidArgumentException;
use Psr\Log\LoggerInterface;
use RuntimeException;
use Throwable;

final readonly class NotificationConsumerService
{
    private const LEASE_SECONDS = 300;
    private const MAX_ATTEMPTS = 3;
    private const RETRY_DELAY_SECONDS = 10;

    private LoggerInterface $logger;

    public function __construct(
        private NotificationEventRepositoryInterface $events,
        private NotificationRepositoryInterface $notifications,
        private NotificationTemplateRepositoryInterface $templates,
        private NotificationEventEnvelopeValidator $validator,
        LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory->get(self::class);
    }

    public function consume(string $eventId): void
    {
        $now = date('Y-m-d H:i:s');
        $token = bin2hex(random_bytes(16));
        $lockedUntil = date('Y-m-d H:i:s', time() + self::LEASE_SECONDS);
        $claimed = $this->events->claimPending($eventId, $token, $lockedUntil, $now);
        if (! $claimed) {
            $claimed = $this->events->recoverExpiredLease($eventId, $token, $lockedUntil, $now);
        }
        if (! $claimed) {
            return;
        }

        $event = $this->events->findByEventId($eventId);
        if ($event === null) {
            return;
        }

        try {
            $envelope = EventEnvelope::fromArray($this->validator->validate($event->getEventPayload()));
            $notificationCount = Db::transaction(function () use ($event, $envelope, $eventId, $token): int {
                $count = $this->consumeEnvelope($event, $envelope);
                if (! $this->events->markSucceeded($eventId, $token, $count, date('Y-m-d H:i:s'))) {
                    throw new RuntimeException('Notification event lease was lost');
                }
                return $count;
            });
            $this->logger->info('Notification event consumed', [
                'event_id' => $eventId,
                'event_type' => $envelope->eventType,
                'organization_code' => $envelope->organizationCode,
                'attempt' => $event->getAttempts(),
                'processing_token' => $token,
                'notification_count' => $notificationCount,
            ]);
            unset($notificationCount);
        } catch (Throwable $throwable) {
            $retryable = ! $throwable instanceof InvalidArgumentException
                && (int) $throwable->getCode() !== 35010
                && $event->getAttempts() < self::MAX_ATTEMPTS;
            $this->events->markFailed(
                $eventId,
                $token,
                (string) ($throwable->getCode() ?: 'NOTIFICATION_CONSUME_ERROR'),
                $throwable->getMessage(),
                $retryable,
                $retryable ? date('Y-m-d H:i:s', time() + self::RETRY_DELAY_SECONDS) : null,
                date('Y-m-d H:i:s'),
            );
            $this->logger->error('Notification event consumption failed', [
                'event_id' => $eventId,
                'event_type' => $event->getEventType()?->value,
                'organization_code' => $event->getOrganizationCode(),
                'attempt' => $event->getAttempts(),
                'processing_token' => $token,
                'error_code' => (string) ($throwable->getCode() ?: 'NOTIFICATION_CONSUME_ERROR'),
                'retryable' => $retryable,
            ]);
            throw $throwable;
        }
    }

    private function consumeEnvelope(NotificationEventEntity $event, EventEnvelope $envelope): int
    {
        $eventType = NotificationEventType::from($envelope->eventType);
        if ($this->isWithdrawal($eventType)) {
            return $this->withdraw($event);
        }

        $messageType = $this->messageType($eventType, $envelope);
        if ($messageType === null) {
            throw new RuntimeException('Event does not generate a message', 35010);
        }
        $template = $this->templates->findLatestActive($messageType->value, 'zh-CN');
        if ($template === null) {
            throw new RuntimeException("Notification template not found: {$messageType->value}", 35010);
        }

        $created = 0;
        foreach ($envelope->recipients as $recipient) {
            $notification = new NotificationEntity();
            $notification->setRecipientUserId($recipient->userId);
            $notification->setCategory(NotificationCategory::SYSTEM);
            $notification->setType($messageType);
            $notification->setTemplateVersion($template->getVersion());
            $notification->setPayload(array_merge($envelope->payload, $recipient->payload));
            $notification->setSourceEventKey($recipient->sourceEventKey);
            $notification->setSourceDomain($envelope->source->domain);
            $notification->setSourceType($envelope->source->type);
            $notification->setSourceId($envelope->source->id);
            $notification->setSourceVersion($envelope->source->version);
            $notification->setMessageStatus(NotificationMessageStatus::ACTIVE);
            $notification->setActionStatus(NotificationActionStatus::NONE);
            $isNew = $this->notifications->findBySourceEventKey(
                NotificationDataIsolation::create($envelope->organizationCode, $recipient->userId),
                $recipient->sourceEventKey,
                $recipient->userId
            ) === null;
            $this->notifications->create(
                NotificationDataIsolation::create($envelope->organizationCode, $recipient->userId),
                $notification
            );
            if ($isNew) {
                ++$created;
            }
        }
        return $created;
    }

    private function withdraw(NotificationEventEntity $event): int
    {
        $isolation = NotificationDataIsolation::create($event->getOrganizationCode());
        return $this->notifications->withdrawAllBySourceIdentity(
            $isolation,
            $event->getSourceDomain(),
            $event->getSourceType(),
            $event->getSourceId(),
            date('Y-m-d H:i:s')
        );
    }

    private function isWithdrawal(NotificationEventType $eventType): bool
    {
        return in_array($eventType, [
            NotificationEventType::PROJECT_WITHDRAWN,
            NotificationEventType::FILE_WITHDRAWN,
        ], true);
    }

    private function messageType(NotificationEventType $eventType, EventEnvelope $envelope): ?NotificationType
    {
        return match ($eventType) {
            NotificationEventType::TASK_FINISHED => NotificationType::TASK_FINISHED,
            NotificationEventType::TASK_ERROR => NotificationType::TASK_FAILED,
            NotificationEventType::PROJECT_RECIPIENTS_ADDED => NotificationType::PROJECT_SHARED,
            NotificationEventType::FILE_RECIPIENTS_ADDED => NotificationType::FILE_SHARED,
            NotificationEventType::SKILL_VERSION_APPROVED => NotificationType::SKILL_APPROVED,
            NotificationEventType::AGENT_VERSION_APPROVED => NotificationType::AGENT_APPROVED,
            default => null,
        };
    }
}
