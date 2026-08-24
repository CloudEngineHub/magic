<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\KnowledgeBase\Service;

use App\Application\KnowledgeBase\DTO\DataIsolationDTO;
use App\Application\KnowledgeBase\DTO\DocumentRequestDTO;
use App\Domain\KnowledgeBase\Port\DocumentGateway;
use Carbon\Carbon;
use Hyperf\DbConnection\Db;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * Uses one MySQL row to coalesce repeated third-file vectorization notifications.
 */
class ThirdFileRevectorizeCooldownService
{
    private const TABLE = 'knowledge_third_file_revectorize_states';

    private const COOLDOWN_MINUTES = 30;

    public function __construct(
        private readonly DocumentGateway $documentGateway,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function notify(DocumentRequestDTO $request): void
    {
        if (! $this->isValid($request)) {
            $this->documentGateway->reVectorizedByThirdFileId($request);
            return;
        }

        $shouldExecute = false;
        $now = Carbon::now();
        $payload = $this->payloadFromRequest($request);

        // Create the unique row before taking the row lock so concurrent first notifications
        // converge on the same record instead of racing on an absent row.
        Db::table(self::TABLE)->insertOrIgnore([
            'organization_code' => $request->dataIsolation->organizationCode,
            'third_platform_type' => $request->thirdPlatformType,
            'third_file_id' => $request->thirdFileId,
            'latest_payload' => json_encode($payload, JSON_THROW_ON_ERROR),
            'last_execute_at' => null,
            'next_execute_at' => null,
            'status' => 'idle',
            'notification_count' => 0,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        Db::transaction(function () use ($request, $payload, $now, &$shouldExecute): void {
            $query = Db::table(self::TABLE)
                ->where('organization_code', $request->dataIsolation->organizationCode)
                ->where('third_platform_type', $request->thirdPlatformType)
                ->where('third_file_id', $request->thirdFileId)
                ->lockForUpdate();
            $state = $query->first();

            if ($state === null) {
                return;
            }

            $lastExecuteAt = $state->last_execute_at !== null
                ? Carbon::parse((string) $state->last_execute_at)
                : null;
            $cooldownUntil = $lastExecuteAt?->copy()->addMinutes(self::COOLDOWN_MINUTES);
            if ($cooldownUntil === null || $cooldownUntil->lessThanOrEqualTo($now)) {
                $shouldExecute = true;
                $nextExecuteAt = null;
                $status = 'idle';
                $lastExecuteAt = $now;
            } else {
                $nextExecuteAt = $cooldownUntil;
                $status = 'pending';
            }

            Db::table(self::TABLE)
                ->where('id', $state->id)
                ->update([
                    'latest_payload' => json_encode($payload, JSON_THROW_ON_ERROR),
                    'last_execute_at' => $lastExecuteAt,
                    'next_execute_at' => $nextExecuteAt,
                    'status' => $status,
                    'notification_count' => ((int) $state->notification_count) + 1,
                    'updated_at' => $now,
                ]);
        });

        if ($shouldExecute) {
            $this->dispatch($request, 'immediate');
        }
    }

    public function dispatchDue(int $limit = 100): int
    {
        $rows = Db::table(self::TABLE)
            ->where('status', 'pending')
            ->whereNotNull('next_execute_at')
            ->where('next_execute_at', '<=', Carbon::now())
            ->orderBy('next_execute_at')
            ->limit(max(1, $limit))
            ->get();

        $dispatched = 0;
        foreach ($rows as $row) {
            $request = null;
            Db::transaction(function () use ($row, &$request): void {
                $state = Db::table(self::TABLE)->where('id', $row->id)->lockForUpdate()->first();
                if ($state === null || $state->status !== 'pending' || $state->next_execute_at === null) {
                    return;
                }
                if (Carbon::parse((string) $state->next_execute_at)->isFuture()) {
                    return;
                }

                $payload = json_decode((string) $state->latest_payload, true, 512, JSON_THROW_ON_ERROR);
                $request = $this->requestFromPayload($payload);
                $now = Carbon::now();
                Db::table(self::TABLE)->where('id', $state->id)->update([
                    'last_execute_at' => $now,
                    'next_execute_at' => null,
                    'status' => 'idle',
                    'updated_at' => $now,
                ]);
            });

            if ($request instanceof DocumentRequestDTO) {
                try {
                    $this->dispatch($request, 'cooldown');
                    ++$dispatched;
                } catch (Throwable $throwable) {
                    $this->logger->warning('Third-file cooldown dispatch failed', [
                        'third_platform_type' => $request->thirdPlatformType,
                        'third_file_id' => $request->thirdFileId,
                        'error' => $throwable->getMessage(),
                    ]);
                }
            }
        }

        return $dispatched;
    }

    private function dispatch(DocumentRequestDTO $request, string $reason): void
    {
        $this->documentGateway->reVectorizedByThirdFileId($request);
        $this->logger->info('Third-file revectorize notification dispatched', [
            'third_platform_type' => $request->thirdPlatformType,
            'third_file_id' => $request->thirdFileId,
            'reason' => $reason,
        ]);
    }

    private function isValid(DocumentRequestDTO $request): bool
    {
        return trim((string) $request->thirdPlatformType) !== ''
            && trim((string) $request->thirdFileId) !== ''
            && trim($request->dataIsolation->organizationCode) !== '';
    }

    private function payloadFromRequest(DocumentRequestDTO $request): array
    {
        return [
            'organization_code' => $request->dataIsolation->organizationCode,
            'user_id' => $request->dataIsolation->userId,
            'third_platform_user_id' => $request->dataIsolation->thirdPlatformUserId,
            'third_platform_organization_code' => $request->dataIsolation->thirdPlatformOrganizationCode,
            'third_platform_type' => $request->thirdPlatformType,
            'third_file_id' => $request->thirdFileId,
            'third_knowledge_id' => $request->thirdKnowledgeId,
        ];
    }

    private function requestFromPayload(array $payload): DocumentRequestDTO
    {
        return DocumentRequestDTO::forReVectorizedByThirdFileId(
            (string) ($payload['third_platform_type'] ?? ''),
            (string) ($payload['third_file_id'] ?? ''),
            new DataIsolationDTO(
                (string) ($payload['organization_code'] ?? ''),
                (string) ($payload['user_id'] ?? ''),
                (string) ($payload['third_platform_user_id'] ?? ''),
                (string) ($payload['third_platform_organization_code'] ?? ''),
            ),
            isset($payload['third_knowledge_id']) ? (string) $payload['third_knowledge_id'] : null,
        );
    }
}
