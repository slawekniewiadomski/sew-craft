<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class)->in('Feature');

expect()->extend('toBeWithinTolerance', function (float $expected, float $tolerance = 1e-6) {
    return $this->toBeGreaterThanOrEqual($expected - $tolerance)
        ->toBeLessThanOrEqual($expected + $tolerance);
});
