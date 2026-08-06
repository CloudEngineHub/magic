<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Application\MagicBase\Support\SelectParser;
use App\Domain\MagicBase\Entity\ValueObject\SelectQuery;

readonly class MagicBaseSelectParserDomainService
{
    public function __construct(
        private SelectParser $parser,
    ) {
    }

    public function parse(?string $select): SelectQuery
    {
        return new SelectQuery($this->parser->parse($select));
    }
}
