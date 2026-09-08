<?php

declare(strict_types=1);

namespace App\Domain\SuperMagic\Project\Repository\Persistence;

use App\Domain\SuperMagic\Project\Repository\Facade\MicroAppVisitRepositoryInterface;
use App\Domain\SuperMagic\Project\Repository\Persistence\Model\MicroAppVisitModel;
use Carbon\Carbon;
use App\Infrastructure\Util\IdGenerator\IdGenerator;

class MicroAppVisitRepository implements MicroAppVisitRepositoryInterface
{
    private const int RETENTION_LIMIT = 20;
    private const int THROTTLE_SECONDS = 30;

    public function recordVisit(int $microAppId, string $userId, string $organizationCode): void
    {
        $now = Carbon::now();
        $query = MicroAppVisitModel::query()
            ->where('micro_app_id', $microAppId)
            ->where('user_id', $userId)
            ->where('organization_code', $organizationCode);
        $existing = $query->first();
        if ($existing !== null && $existing->last_visited_at !== null
            && Carbon::parse($existing->last_visited_at)->gt($now->copy()->subSeconds(self::THROTTLE_SECONDS))) {
            return;
        }

        MicroAppVisitModel::query()->upsert([
            [
                'id' => $existing?->id ?? IdGenerator::getSnowId(),
                'micro_app_id' => $microAppId,
                'user_id' => $userId,
                'organization_code' => $organizationCode,
                'last_visited_at' => $now,
                'created_at' => $existing?->created_at ?? $now,
                'updated_at' => $now,
            ],
        ], ['micro_app_id', 'user_id', 'organization_code'], ['last_visited_at', 'updated_at']);

        $oldIds = MicroAppVisitModel::query()
            ->where('user_id', $userId)
            ->where('organization_code', $organizationCode)
            ->orderByDesc('last_visited_at')
            ->orderByDesc('micro_app_id')
            ->offset(self::RETENTION_LIMIT)
            ->pluck('id');
        if ($oldIds->isNotEmpty()) {
            MicroAppVisitModel::query()->whereIn('id', $oldIds->all())->delete();
        }
    }
}
