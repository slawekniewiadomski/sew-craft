<?php

use App\Models\Project;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    $this->user = User::factory()->create();
    Sanctum::actingAs($this->user);
});

it('lists every public project with its owner and edit right', function () {
    $other = User::factory()->create();
    Project::factory()->for($this->user)->create(['name' => 'Mine']);
    Project::factory()->for($other)->create(['name' => 'Theirs']);

    $response = $this->getJson('/api/projects');

    $response->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('my_project_count', 1);

    $mine = collect($response->json('data'))->firstWhere('name', 'Mine');
    $theirs = collect($response->json('data'))->firstWhere('name', 'Theirs');

    expect($mine['can_edit'])->toBeTrue()
        ->and($mine['owner'])->toBe(['id' => $this->user->id, 'email' => $this->user->email])
        ->and($theirs['can_edit'])->toBeFalse()
        ->and($theirs['owner']['email'])->toBe($other->email);
});

it('creates a project owned by the account', function () {
    $this->postJson('/api/projects', [
        'name' => 'Summer dress',
        'description' => 'A-line dress block',
    ])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Summer dress')
        ->assertJsonPath('data.user_id', $this->user->id)
        ->assertJsonPath('data.can_edit', true);

    expect(Project::count())->toBe(1);
    expect(Project::sole()->user_id)->toBe($this->user->id);
});

it('validates the project name', function () {
    $this->postJson('/api/projects', ['name' => ''])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('name');
});

it('caps an account at three projects', function () {
    Project::factory()->for($this->user)->count(3)->create();

    $this->postJson('/api/projects', ['name' => 'Fourth'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('name');

    expect($this->user->projects()->count())->toBe(3);
});

it('shows a public project to another account', function () {
    $owner = User::factory()->create();
    $project = Project::factory()->for($owner)->create(['name' => 'Bodice']);

    $this->getJson("/api/projects/{$project->id}")
        ->assertOk()
        ->assertJsonPath('data.name', 'Bodice')
        ->assertJsonPath('data.can_edit', false)
        ->assertJsonPath('data.owner.email', $owner->email);
});

it('updates an owned project', function () {
    $project = Project::factory()->for($this->user)->create(['name' => 'Old']);

    $this->putJson("/api/projects/{$project->id}", ['name' => 'New'])
        ->assertOk()
        ->assertJsonPath('data.name', 'New');

    expect($project->refresh()->name)->toBe('New');
});

it('refuses to update another account project', function () {
    $owner = User::factory()->create();
    $project = Project::factory()->for($owner)->create(['name' => 'Old']);

    $this->putJson("/api/projects/{$project->id}", ['name' => 'New'])
        ->assertForbidden();

    expect($project->refresh()->name)->toBe('Old');
});

it('deletes an owned project', function () {
    $project = Project::factory()->for($this->user)->create();

    $this->deleteJson("/api/projects/{$project->id}")->assertNoContent();

    expect(Project::count())->toBe(0);
});

it('refuses to delete another account project', function () {
    $owner = User::factory()->create();
    $project = Project::factory()->for($owner)->create();

    $this->deleteJson("/api/projects/{$project->id}")->assertForbidden();

    expect(Project::count())->toBe(1);
});
