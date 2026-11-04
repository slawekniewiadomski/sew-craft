<?php

namespace App\Services;

use Carbon\CarbonInterface;

/**
 * A read-only view of a project's current pattern. `id`, `document` and
 * `savedAt` are null when the project has never been saved.
 */
final readonly class PatternSnapshot
{
    /**
     * @param  array<string, mixed>|null  $document
     */
    public function __construct(
        public ?int $id,
        public int $projectId,
        public ?array $document,
        public int $version,
        public ?CarbonInterface $savedAt,
    ) {}
}
