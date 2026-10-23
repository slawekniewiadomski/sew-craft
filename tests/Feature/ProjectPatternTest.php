<?php

use App\Models\Pattern;
use App\Models\PatternVersion;
use App\Models\Project;
use Illuminate\Support\Facades\DB;

/**
 * @return array<string, mixed>
 */
function patternDocument(string $schema = 'sewcraft.pattern/0.2'): array
{
    return [
        'schema' => $schema,
        'units' => 'mm',
        'entities' => [],
        'constraints' => [],
        'pieces' => [],
    ];
}

it('shows an unsaved pattern without a document', function () {
    $project = Project::factory()->create(['name' => 'Summer dress']);

    $this->getJson("/api/projects/{$project->id}/pattern")
        ->assertOk()
        ->assertJsonPath('data.id', null)
        ->assertJsonPath('data.project_id', $project->id)
        ->assertJsonPath('data.name', 'Summer dress')
        ->assertJsonPath('data.document', null)
        ->assertJsonPath('data.version', 0)
        ->assertJsonPath('data.saved_at', null);
});

it('returns a 404 for a missing project', function () {
    $this->getJson('/api/projects/999/pattern')->assertNotFound();
});

it('shows the working copy and latest checkpoint', function () {
    $project = Project::factory()->create();
    $pattern = Pattern::factory()->for($project)->create([
        'name' => 'Front',
        'geometry' => patternDocument(),
    ]);
    PatternVersion::create([
        'pattern_id' => $pattern->id,
        'version' => 3,
        'geometry' => patternDocument(),
    ]);

    $this->getJson("/api/projects/{$project->id}/pattern")
        ->assertOk()
        ->assertJsonPath('data.id', $pattern->id)
        ->assertJsonPath('data.name', 'Front')
        ->assertJsonPath('data.document.schema', 'sewcraft.pattern/0.2')
        ->assertJsonPath('data.version', 3)
        ->assertJsonPath('data.saved_at', fn ($value) => is_string($value));
});

it('reports zero for a pattern without checkpoints', function () {
    $project = Project::factory()->create();
    Pattern::factory()->for($project)->create(['geometry' => patternDocument()]);

    $this->getJson("/api/projects/{$project->id}/pattern")
        ->assertOk()
        ->assertJsonPath('data.version', 0)
        ->assertJsonPath('data.saved_at', null);
});

it('creates the pattern and its first checkpoint on the first save', function () {
    $project = Project::factory()->create(['name' => 'Summer dress']);

    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => patternDocument(),
        'expected_version' => null,
    ])
        ->assertOk()
        ->assertJsonPath('data.version', 1)
        ->assertJsonPath('data.created', true)
        ->assertJsonPath('data.saved_at', fn ($value) => is_string($value));

    $pattern = Pattern::query()->sole();
    expect($pattern->project_id)->toBe($project->id)
        ->and($pattern->name)->toBe('Summer dress')
        ->and($pattern->geometry)->toBe(patternDocument());
    expect($pattern->versions()->pluck('version')->all())->toBe([1]);
});

it('appends one checkpoint per changed save', function () {
    $project = Project::factory()->create();

    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => patternDocument(),
        'expected_version' => null,
    ])->assertOk();

    $document = patternDocument();
    $document['entities'] = [
        ['id' => 'p', 'kind' => 'point', 'x' => 1, 'y' => 2, 'construction' => false, 'fixed' => false],
    ];

    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => $document,
        'expected_version' => 1,
    ])
        ->assertOk()
        ->assertJsonPath('data.version', 2)
        ->assertJsonPath('data.created', false);

    $pattern = Pattern::query()->sole();
    expect($pattern->geometry['entities'])->toHaveCount(1);
    expect($pattern->versions()->pluck('version')->all())->toBe([1, 2]);
});

it('does not append a checkpoint for an unchanged document', function () {
    $project = Project::factory()->create();

    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => patternDocument(),
        'expected_version' => null,
    ])->assertOk();

    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => patternDocument(),
        'expected_version' => 1,
    ])
        ->assertOk()
        ->assertJsonPath('data.version', 1)
        ->assertJsonPath('data.created', false);

    expect(PatternVersion::query()->count())->toBe(1);
});

it('rejects a stale expected version with the current checkpoint', function () {
    $project = Project::factory()->create();
    Pattern::factory()->for($project)->create();

    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => patternDocument(),
        'expected_version' => null,
    ])->assertOk();

    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => patternDocument(),
        'expected_version' => 0,
    ])
        ->assertStatus(409)
        ->assertJsonPath('message', 'The project was saved by someone else.')
        ->assertJsonPath('current_version', 1)
        ->assertJsonPath('saved_at', fn ($value) => is_string($value));

    expect(PatternVersion::query()->count())->toBe(1);
});

it('forces an overwrite when the expected version is null', function () {
    $project = Project::factory()->create();
    Pattern::factory()->for($project)->create();
    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => patternDocument(),
        'expected_version' => null,
    ])->assertOk();

    $document = patternDocument();
    $document['entities'] = [
        ['id' => 'p', 'kind' => 'point', 'x' => 0, 'y' => 0, 'construction' => false, 'fixed' => false],
    ];

    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => $document,
        'expected_version' => null,
    ])
        ->assertOk()
        ->assertJsonPath('data.version', 2);
});

it('archives the old working copy before an upgrade save', function () {
    $project = Project::factory()->create();
    $pattern = Pattern::factory()->for($project)->create([
        'geometry' => patternDocument('sewcraft.pattern/0.1'),
    ]);
    PatternVersion::create([
        'pattern_id' => $pattern->id,
        'version' => 1,
        'geometry' => patternDocument('sewcraft.pattern/0.1'),
    ]);

    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => patternDocument(),
        'expected_version' => 1,
        'expected_schema' => 'sewcraft.pattern/0.1',
    ])
        ->assertOk()
        ->assertJsonPath('data.version', 3);

    $versions = $pattern->versions()->orderBy('version')->get();
    expect($versions->pluck('version')->all())->toBe([1, 2, 3])
        ->and($versions[1]->geometry['schema'])->toBe('sewcraft.pattern/0.1')
        ->and($versions[2]->geometry['schema'])->toBe('sewcraft.pattern/0.2');
});

it('does not archive when the save carries no expected schema', function () {
    $project = Project::factory()->create();
    $pattern = Pattern::factory()->for($project)->create([
        'geometry' => patternDocument('sewcraft.pattern/0.1'),
    ]);

    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => patternDocument(),
        'expected_version' => null,
    ])
        ->assertOk()
        ->assertJsonPath('data.version', 1);

    expect($pattern->versions()->count())->toBe(1);
});

it('validates the document envelope', function () {
    $project = Project::factory()->create();

    $this->putJson("/api/projects/{$project->id}/pattern", [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('document');

    $this->putJson("/api/projects/{$project->id}/pattern", ['document' => 'nope'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('document');

    $this->putJson("/api/projects/{$project->id}/pattern", ['document' => ['units' => 'mm']])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('document.schema');

    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => ['schema' => 'sewcraft.pattern/0.2', 'units' => 'cm'],
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('document.units');
});

it('rejects a document larger than two megabytes', function () {
    $project = Project::factory()->create();

    $document = patternDocument();
    $document['blob'] = str_repeat('a', 2 * 1024 * 1024);

    $this->putJson("/api/projects/{$project->id}/pattern", ['document' => $document])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('document');
});

it('validates the expected version and schema', function () {
    $project = Project::factory()->create();

    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => patternDocument(),
        'expected_version' => -1,
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('expected_version');

    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => patternDocument(),
        'expected_version' => 'first',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('expected_version');

    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => patternDocument(),
        'expected_schema' => 1,
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('expected_schema');
});

it('returns a 404 when saving to a missing project', function () {
    $this->putJson('/api/projects/999/pattern', [
        'document' => patternDocument(),
        'expected_version' => null,
    ])->assertNotFound();
});

it('saves an empty document', function () {
    $project = Project::factory()->create();

    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => patternDocument(),
        'expected_version' => null,
    ])
        ->assertOk()
        ->assertJsonPath('data.version', 1);
});

it('saves to the first pattern only', function () {
    $project = Project::factory()->create();
    $first = Pattern::factory()->for($project)->create();
    $second = Pattern::factory()->for($project)->create();

    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => patternDocument(),
        'expected_version' => null,
    ])
        ->assertOk()
        ->assertJsonPath('data.id', $first->id);

    expect($first->refresh()->geometry)->toBe(patternDocument())
        ->and($second->refresh()->geometry)->toBeNull();
});

it('rolls the transaction back when the expected version conflicts', function () {
    $project = Project::factory()->create();

    $this->putJson("/api/projects/{$project->id}/pattern", [
        'document' => patternDocument(),
        'expected_version' => 5,
    ])->assertStatus(409);

    expect(Pattern::query()->count())->toBe(0)
        ->and(DB::table('pattern_versions')->count())->toBe(0);
});
