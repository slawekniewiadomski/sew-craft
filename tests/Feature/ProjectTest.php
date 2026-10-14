<?php

use App\Models\Project;

it('lists projects', function () {
    Project::factory()->count(2)->create();

    $this->getJson('/api/projects')
        ->assertOk()
        ->assertJsonCount(2, 'data');
});

it('creates a project', function () {
    $this->postJson('/api/projects', [
        'name' => 'Summer dress',
        'description' => 'A-line dress block',
    ])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Summer dress');

    expect(Project::count())->toBe(1);
});

it('validates the project name', function () {
    $this->postJson('/api/projects', ['name' => ''])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('name');
});

it('shows a project', function () {
    $project = Project::factory()->create(['name' => 'Bodice']);

    $this->getJson("/api/projects/{$project->id}")
        ->assertOk()
        ->assertJsonPath('data.name', 'Bodice');
});

it('updates a project', function () {
    $project = Project::factory()->create(['name' => 'Old']);

    $this->putJson("/api/projects/{$project->id}", ['name' => 'New'])
        ->assertOk()
        ->assertJsonPath('data.name', 'New');

    expect($project->refresh()->name)->toBe('New');
});

it('deletes a project', function () {
    $project = Project::factory()->create();

    $this->deleteJson("/api/projects/{$project->id}")->assertNoContent();

    expect(Project::count())->toBe(0);
});
