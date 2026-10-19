<?php

declare(strict_types=1);

/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Notification\Validator;

use App\Application\Notification\Contract\EventEnvelope;
use App\Domain\Notification\Service\NotificationEventTypeRegistry;
use DateTimeImmutable;
use InvalidArgumentException;

final readonly class NotificationEventEnvelopeValidator
{
    public function __construct(private NotificationEventTypeRegistry $registry)
    {
    }

    /**
     * Validate the boundary contract before an event is persisted.
     *
     * @param EventEnvelope|array<string, mixed> $envelope
     * @return array<string, mixed>
     */
    public function validate(EventEnvelope|array $envelope): array
    {
        $data = $envelope instanceof EventEnvelope ? $envelope->toArray() : $envelope;
        foreach (['event_id', 'event_type', 'occurred_at', 'producer', 'organization_code', 'source', 'recipients', 'payload', 'schema_version'] as $field) {
            if (! array_key_exists($field, $data)) {
                throw new InvalidArgumentException("Missing event field: {$field}");
            }
        }

        $this->assertSnowflake('event_id', $data['event_id']);
        if ((int) $data['schema_version'] !== 1) {
            throw new InvalidArgumentException('Unsupported schema_version');
        }
        $eventType = trim((string) $data['event_type']);
        if ($eventType === '' || ! $this->registry->exists($eventType)) {
            throw new InvalidArgumentException("Unknown event_type: {$eventType}");
        }
        foreach (['occurred_at', 'producer', 'organization_code'] as $field) {
            if (trim((string) $data[$field]) === '') {
                throw new InvalidArgumentException("{$field} cannot be empty");
            }
        }
        $occurredAt = (string) $data['occurred_at'];
        $occurredDate = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $occurredAt);
        if ($occurredDate === false || $occurredDate->format('Y-m-d H:i:s') !== $occurredAt) {
            throw new InvalidArgumentException('occurred_at must use YYYY-MM-dd HH:mm:ss');
        }

        $source = $data['source'];
        if (! is_array($source)) {
            throw new InvalidArgumentException('source must be an object');
        }
        foreach (['domain', 'type', 'id'] as $field) {
            if (! isset($source[$field]) || trim((string) $source[$field]) === '') {
                throw new InvalidArgumentException("source.{$field} is required");
            }
        }
        $this->assertSnowflake('source.id', $source['id']);
        if (array_key_exists('version', $source) && $source['version'] !== null && trim((string) $source['version']) === '') {
            throw new InvalidArgumentException('source.version cannot be empty');
        }
        $this->assertSourceDomain($eventType, (string) $source['domain']);

        if (! is_array($data['recipients'])) {
            throw new InvalidArgumentException('recipients must be an array');
        }
        $seen = [];
        foreach ($data['recipients'] as $recipient) {
            if (! is_array($recipient)) {
                throw new InvalidArgumentException('recipient must be an object');
            }
            if (! isset($recipient['user_id']) || trim((string) $recipient['user_id']) === '') {
                throw new InvalidArgumentException('recipient.user_id is required');
            }
            $userId = (string) $recipient['user_id'];
            if (isset($seen[$userId])) {
                throw new InvalidArgumentException('Duplicate recipient user_id');
            }
            $seen[$userId] = true;
            $sourceEventKey = (string) ($recipient['source_event_key'] ?? '');
            if ($sourceEventKey === '' || strlen($sourceEventKey) > 255 || preg_match('/[\x00-\x1F\x7F]/', $sourceEventKey)) {
                throw new InvalidArgumentException('recipient.source_event_key is invalid');
            }
            $this->assertSourceEventKey($eventType, $sourceEventKey);
            if (isset($recipient['payload']) && ! is_array($recipient['payload'])) {
                throw new InvalidArgumentException('recipient.payload must be an object');
            }
        }

        $isWithdrawal = str_ends_with($eventType, '.withdrawn');
        if ($data['recipients'] === [] && ! $isWithdrawal) {
            throw new InvalidArgumentException('At least one recipient is required');
        }
        if (! is_array($data['payload'])) {
            throw new InvalidArgumentException('payload must be an object');
        }

        return $data;
    }

    private function assertSnowflake(string $field, mixed $value): void
    {
        if (! is_string($value) && ! is_int($value)) {
            throw new InvalidArgumentException("{$field} must be a decimal snowflake string");
        }
        if (! preg_match('/^[0-9]+$/', (string) $value)) {
            throw new InvalidArgumentException("{$field} must be a decimal snowflake string");
        }
    }

    private function assertSourceDomain(string $eventType, string $domain): void
    {
        $expected = explode('.', $eventType, 2)[0];
        if ($expected !== $domain) {
            throw new InvalidArgumentException("source.domain does not match event_type: {$eventType}");
        }
    }

    private function assertSourceEventKey(string $eventType, string $sourceEventKey): void
    {
        $pattern = match (true) {
            $eventType === 'task.finished' => '/^task:[^:]+:[0-9]+:[0-9]+:finished$/',
            $eventType === 'task.error' => '/^task:[^:]+:[0-9]+:[0-9]+:error$/',
            $eventType === 'share.project.recipients_added' => '/^share:[^:]+:project:[0-9]+:[^:]+:[^:]+$/',
            $eventType === 'share.file.recipients_added' => '/^share:[^:]+:file:[0-9]+:[^:]+:[^:]+$/',
            $eventType === 'review.skill.version_approved' => '/^review:[^:]+:skill:[0-9]+:[0-9]+:[^:]+:approved$/',
            $eventType === 'review.agent.version_approved' => '/^review:[^:]+:agent:[0-9]+:[0-9]+:[^:]+:approved$/',
            str_starts_with($eventType, 'collaboration.') => '/^collaboration:[^:]+:(project|agent|skill):[0-9]+:[0-9]+:[0-9]+$/',
            default => null,
        };
        if ($pattern !== null && preg_match($pattern, $sourceEventKey) !== 1) {
            throw new InvalidArgumentException("source_event_key does not match event_type: {$eventType}");
        }
    }
}
