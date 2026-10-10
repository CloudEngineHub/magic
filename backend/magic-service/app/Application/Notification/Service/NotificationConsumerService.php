<?php

declare(strict_types=1);

/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Notification\Service;

use App\Application\Notification\Contract\EventEnvelope;
use App\Application\Notification\Exception\NotificationEventValidationException;
use App\Application\Notification\Strategy\NotificationCatalogStrategyInterface;
use App\Application\Notification\Validator\NotificationEventEnvelopeValidator;
use App\Domain\Notification\Constant\NotificationActionStatus;
use App\Domain\Notification\Constant\NotificationCategory;
use App\Domain\Notification\Constant\NotificationEventType;
use App\Domain\Notification\Constant\NotificationMessageStatus;
use App\Domain\Notification\Constant\NotificationTemplateStatus;
use App\Domain\Notification\Entity\NotificationEntity;
use App\Domain\Notification\Entity\NotificationEventEntity;
use App\Domain\Notification\Entity\ValueObject\NotificationDataIsolation;
use App\Domain\Notification\Repository\Facade\NotificationEventRepositoryInterface;
use App\Domain\Notification\Repository\Facade\NotificationRepositoryInterface;
use App\Domain\Notification\Repository\Facade\NotificationTemplateRepositoryInterface;
use App\ErrorCode\EventErrorCode;
use App\ErrorCode\NotificationErrorCode;
use Hyperf\Contract\ConfigInterface;
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
        private NotificationCatalogStrategyInterface $catalog,
        private ConfigInterface $config,
        LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory->get(self::class);
    }

    public function consume(string $eventId): void
    {
        $now = date('Y-m-d H:i:s');
        $token = bin2hex(random_bytes(16));
        $lockedUntil = date('Y-m-d H:i:s', time() + $this->leaseSeconds());
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
                && ! $throwable instanceof NotificationEventValidationException
                && (int) $throwable->getCode() !== NotificationErrorCode::TEMPLATE_NOT_FOUND->value
                && $event->getAttempts() < self::MAX_ATTEMPTS;
            $this->events->markFailed(
                $eventId,
                $token,
                NotificationErrorFormatter::code(
                    $throwable,
                    $throwable instanceof InvalidArgumentException
                        ? EventErrorCode::EVENT_CONSUMER_VALIDATION_FAILED->value
                        : ($throwable instanceof NotificationEventValidationException
                            ? NotificationErrorCode::EVENT_PAYLOAD_INVALID->value
                            : EventErrorCode::EVENT_CONSUMER_EXECUTION_FAILED->value)
                ),
                NotificationErrorFormatter::message($throwable),
                $retryable,
                $retryable ? date('Y-m-d H:i:s', time() + self::RETRY_DELAY_SECONDS) : null,
                date('Y-m-d H:i:s'),
            );
            $this->logger->error('Notification event consumption failed', [
                'event_id' => $eventId,
                'event_type' => $event->getEventType(),
                'organization_code' => $event->getOrganizationCode(),
                'attempt' => $event->getAttempts(),
                'processing_token' => $token,
                'error_code' => NotificationErrorFormatter::code(
                    $throwable,
                    $throwable instanceof InvalidArgumentException
                        ? EventErrorCode::EVENT_CONSUMER_VALIDATION_FAILED->value
                        : ($throwable instanceof NotificationEventValidationException
                            ? NotificationErrorCode::EVENT_PAYLOAD_INVALID->value
                            : EventErrorCode::EVENT_CONSUMER_EXECUTION_FAILED->value)
                ),
                'error' => $throwable->getMessage(),
                'trace' => $throwable->getTraceAsString(),
                'retryable' => $retryable,
            ]);
            throw $throwable;
        }
    }

    private function leaseSeconds(): int
    {
        return max(1, (int) $this->config->get('notification.processing_lease_seconds', self::LEASE_SECONDS));
    }

    private function consumeEnvelope(NotificationEventEntity $event, EventEnvelope $envelope): int
    {
        $eventType = $envelope->eventType;
        if ($this->isWithdrawal($eventType)) {
            return $this->withdraw($event);
        }

        // The source type is the stable fallback for permission-change events;
        // an explicit payload value still takes precedence for host adapters.
        $messageType = $this->catalog->notificationTypeForEvent(
            $eventType,
            array_merge(['resource_type' => $envelope->source->type], $envelope->payload)
        );
        if ($messageType === null) {
            throw new RuntimeException('Event does not generate a message', NotificationErrorCode::TEMPLATE_NOT_FOUND->value);
        }
        $template = $this->templates->findLatestActive($messageType, 'zh-CN');
        if ($template === null) {
            throw new RuntimeException("Notification template not found: {$messageType}", NotificationErrorCode::TEMPLATE_NOT_FOUND->value);
        }
        $englishTemplate = $this->templates->findByTypeVersionLocale(
            $messageType,
            $template->getVersion(),
            'en-US'
        );
        if ($englishTemplate === null || $englishTemplate->getStatus() !== NotificationTemplateStatus::ACTIVE) {
            throw new RuntimeException("Notification template pair not found: {$messageType}:{$template->getVersion()}", NotificationErrorCode::TEMPLATE_NOT_FOUND->value);
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
            $existingNotification = $this->notifications->findBySourceEventKey(
                NotificationDataIsolation::create($envelope->organizationCode, $recipient->userId),
                $recipient->sourceEventKey,
                $recipient->userId
            );
            $persistedNotification = $this->notifications->create(
                NotificationDataIsolation::create($envelope->organizationCode, $recipient->userId),
                $notification
            );
            if ($existingNotification === null && $persistedNotification->getId() === $notification->getId()) {
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

    private function isWithdrawal(string $eventType): bool
    {
        return in_array($eventType, [
            NotificationEventType::PROJECT_WITHDRAWN->value,
            NotificationEventType::FILE_WITHDRAWN->value,
        ], true);
    }
}
