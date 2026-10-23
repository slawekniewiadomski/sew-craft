<?php

namespace App\Exceptions;

use Carbon\CarbonInterface;
use RuntimeException;

/**
 * Raised when a save carries an expected version that no longer matches the
 * stored checkpoint. The controller turns it into the documented 409 body.
 */
class PatternConflictException extends RuntimeException
{
    public function __construct(
        public readonly int $currentVersion,
        public readonly ?CarbonInterface $savedAt,
    ) {
        parent::__construct('The project was saved by someone else.');
    }
}
