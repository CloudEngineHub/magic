<?php

declare(strict_types=1);

/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Notification\Service;

use App\Application\Notification\Contract\EventEnvelope;
use App\Application\Notification\Contract\NotificationEventPublisherInterface;
use App\Application\Notification\Event\NotificationEventConsumeRequested;
use App\Application\Notification\Validator\NotificationEventEnvelopeValidator;
use App\Domain\Notification\Constant\NotificationEventStatus;
use App\Domain\Notification\Constant\NotificationEventType;
use App\Domain\Notification\Entity\NotificationEventEntity;
use App\Domain\Notification\Repository\Facade\NotificationEventRepositoryInterface;
use Psr\EventDispatcher\EventDispatcherInterface;

final readonly class NotificationEventAppService implements NotificationEventPublisherInterface
{
    public function __construct(
        private NotificationEventEnvelopeValidator $validator,
        private NotificationEventRepositoryInterface $events,
        private EventDispatcherInterface $dispatcher,
    ) {
    }

    /** @return array{event_id:string,status:string,accepted:bool,duplicate:bool} */
    public function publish(EventEnvelope|array $envelope): array
    {
        $data = $this->validator->validate($envelope);
        $eventId = (string) $data['event_id'];
        $existing = $this->events->findByEventId($eventId);
        $duplicate = $existing !== null;

        if ($existing === null) {
            $source = (array) $data['source'];
            $entity = new NotificationEventEntity();
            $entity->setEventId($eventId);
            $entity->setEventType(NotificationEventType::from((string) $data['event_type']));
            $entity->setOrganizationCode((string) $data['organization_code']);
            $entity->setSourceDomain((string) $source['domain']);
            $entity->setSourceType((string) $source['type']);
            $entity->setSourceId((string) $source['id']);
            $entity->setSourceVersion(isset($source['version']) ? (string) $source['version'] : null);
            $entity->setEventPayload($data);
            $entity->setStatus(NotificationEventStatus::PENDING);
            $entity->setRecipientCount(count((array) $data['recipients']));
            $existing = $this->events->createOrGet($entity);
            $duplicate = $existing->getId() !== $entity->getId();
        }

        // A duplicate pending event can be a prior publish whose async dispatch failed.
        // Re-publishing the lightweight trigger is safe because the consumer uses a CAS lease.
        if ($existing->getStatus() === NotificationEventStatus::PENDING) {
            $this->dispatcher->dispatch(new NotificationEventConsumeRequested($eventId));
        }

        return [
            'event_id' => $eventId,
            'status' => $existing->getStatus()->value,
            'accepted' => true,
            'duplicate' => $duplicate,
        ];
    }
}
