<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\ModelGateway\Repository;

use App\Domain\ModelGateway\Entity\ImageGenerationTaskEntity;

interface ImageGenerationTaskRepositoryInterface
{
    public function getById(string $id): ?ImageGenerationTaskEntity;

    public function save(ImageGenerationTaskEntity $entity): void;
}
