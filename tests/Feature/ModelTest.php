<?php

use App\Models\Pattern;
use App\Models\PatternVersion;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;

it('relates a project to its patterns and back', function () {
    $project = Project::factory()->create();
    $pattern = Pattern::factory()->for($project)->create();

    expect($project->patterns)->toHaveCount(1)
        ->and($project->patterns->first()->is($pattern))->toBeTrue()
        ->and($pattern->project->is($project))->toBeTrue();
});

it('casts pattern geometry to an array', function () {
    $pattern = Pattern::factory()->create(['geometry' => ['schema' => 'sewcraft/1']]);

    expect($pattern->fresh()->geometry)->toBe(['schema' => 'sewcraft/1']);
});

it('relates a pattern to its versions and back', function () {
    $pattern = Pattern::factory()->create();
    $version = PatternVersion::create([
        'pattern_id' => $pattern->id,
        'version' => 1,
        'geometry' => ['entities' => []],
    ]);

    expect($pattern->versions)->toHaveCount(1)
        ->and($pattern->versions->first()->is($version))->toBeTrue()
        ->and($version->pattern->is($pattern))->toBeTrue()
        ->and($version->geometry)->toBe(['entities' => []]);
});

it('does not manage an updated_at column for pattern versions', function () {
    $version = PatternVersion::create([
        'pattern_id' => Pattern::factory()->create()->id,
        'version' => 1,
        'geometry' => ['entities' => []],
    ]);

    expect($version->getUpdatedAtColumn())->toBeNull()
        ->and($version->updated_at)->toBeNull();
});

it('casts user attributes and hashes the password', function () {
    $user = User::factory()->create([
        'email_verified_at' => now(),
        'password' => 'secret-password',
    ]);

    expect($user->email_verified_at)->toBeInstanceOf(Carbon::class)
        ->and(Hash::check('secret-password', $user->password))->toBeTrue();
});

it('supports an unverified user state', function () {
    $user = User::factory()->unverified()->create();

    expect($user->email_verified_at)->toBeNull();
});
