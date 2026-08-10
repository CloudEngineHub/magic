<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Application\SuperAgent\Event\Subscribe;

use App\Domain\Chat\Entity\ValueObject\SocketEventType;
use App\Domain\Contact\Service\MagicUserDomainService;
use App\Infrastructure\Util\SocketIO\SocketIOUtil;
use Dtyq\AsyncEvent\Kernel\Annotation\AsyncListener;
use Dtyq\SuperMagic\Domain\SuperAgent\Event\CheckpointRollbackMessagesChangedEvent;
use Hyperf\Event\Annotation\Listener;
use Hyperf\Event\Contract\ListenerInterface;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;
use Throwable;

#[AsyncListener]
#[Listener(priority: -100)]
class CheckpointRollbackMessageNotificationSubscriber implements ListenerInterface
{
    private const int MAX_AFFECTED_SEQ_IDS = 500;

    private readonly LoggerInterface $logger;

    public function __construct(
        private readonly MagicUserDomainService $userDomainService,
        LoggerFactory $loggerFactory
    ) {
        $this->logger = $loggerFactory->get(static::class);
    }

    public function listen(): array
    {
        return [CheckpointRollbackMessagesChangedEvent::class];
    }

    public function process(object $event): void
    {
        if (! $event instanceof CheckpointRollbackMessagesChangedEvent) {
            return;
        }

        try {
            $magicId = $this->getMagicIdByUserId($event->getUserId());
            if ($magicId === '') {
                $this->logger->warning('Cannot get magicId for checkpoint rollback notification', [
                    'user_id' => $event->getUserId(),
                    'topic_id' => $event->getTopicId(),
                    'action' => $event->getAction(),
                ]);
                return;
            }

            $pushData = $this->buildPushData($event);
            $this->sendNotification($magicId, $pushData);

            $this->logger->info('Checkpoint rollback message notification pushed', [
                'magic_id' => $magicId,
                'topic_id' => $event->getTopicId(),
                'action' => $event->getAction(),
                'affected_count' => count($event->getAffectedSeqIds()),
            ]);
        } catch (Throwable $throwable) {
            $this->logger->error('Failed to push checkpoint rollback message notification', [
                'event_id' => $event->getEventId(),
                'topic_id' => $event->getTopicId(),
                'action' => $event->getAction(),
                'error' => $throwable->getMessage(),
                'trace' => $throwable->getTraceAsString(),
            ]);
        }
    }

    protected function sendNotification(int|string $magicId, array $pushData): void
    {
        SocketIOUtil::sendIntermediate(SocketEventType::Intermediate, $magicId, $pushData);
    }

    private function buildPushData(CheckpointRollbackMessagesChangedEvent $event): array
    {
        $affectedSeqIds = array_values(array_map('strval', $event->getAffectedSeqIds()));
        $affectedCount = count($affectedSeqIds);

        return [
            'type' => 'seq',
            'seq' => [
                'magic_id' => '',
                'seq_id' => (string) $event->getEventId(),
                'message_id' => '',
                'refer_message_id' => '',
                'sender_message_id' => '',
                'conversation_id' => $event->getConversationId(),
                'organization_code' => $event->getOrganizationCode(),
                'message' => [
                    'type' => 'super_magic_checkpoint_rollback',
                    'action' => $event->getAction(),
                    'project_id' => (string) $event->getProjectId(),
                    'topic_id' => (string) $event->getTopicId(),
                    'chat_topic_id' => $event->getChatTopicId(),
                    'target_seq_id' => $event->getTargetSeqId(),
                    'affected_seq_ids' => array_slice($affectedSeqIds, 0, self::MAX_AFFECTED_SEQ_IDS),
                    'affected_count' => $affectedCount,
                    'truncated' => $affectedCount > self::MAX_AFFECTED_SEQ_IDS,
                    'refresh_required' => true,
                    'timestamp' => date('c'),
                ],
            ],
        ];
    }

    private function getMagicIdByUserId(string $userId): string
    {
        try {
            return $this->userDomainService->getUserById($userId)?->getMagicId() ?? '';
        } catch (Throwable $throwable) {
            $this->logger->error('Failed to get magicId for checkpoint rollback notification', [
                'user_id' => $userId,
                'error' => $throwable->getMessage(),
            ]);
            return '';
        }
    }
}
