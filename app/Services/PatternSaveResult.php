<?php

namespace App\Services;

use Carbon\CarbonInterface;

/**
 * The outcome of one save: the checkpoint it produced and whether the save
 * created the project's pattern row.
 */
final readonly class PatternSaveResult
{
    public function __construct(
        public int $id,
        public int $version,
        public CarbonInterface $savedAt,
        public bool $created,
    ) {}
}
