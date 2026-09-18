<?php

declare(strict_types=1);

namespace App\Domain\SuperMagic\Project\Repository\Facade;

interface MicroAppVisitRepositoryInterface
{
    public function recordVisit(int $microAppId, string $userId, string $organizationCode): void;
}
