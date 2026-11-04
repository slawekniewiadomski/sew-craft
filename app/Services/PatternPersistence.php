<?php

namespace App\Services;

use App\Exceptions\PatternConflictException;
use App\Models\Pattern;
use App\Models\PatternVersion;
use App\Models\Project;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Reads and writes a project's pattern document.
 *
 * The write path is a document snapshot, not server-side command replay: the
 * only command interpreter is the TypeScript geometry package, so the server
 * stores the document as opaque JSON and appends one checkpoint per change.
 */
final class PatternPersistence
{
    public function snapshot(Project $project): PatternSnapshot
    {
        $pattern = $this->patternFor($project);

        if ($pattern === null) {
            return new PatternSnapshot(
                id: null,
                projectId: $project->id,
                document: null,
                version: 0,
                savedAt: null,
            );
        }

        $latest = $this->latestVersion($pattern);

        return new PatternSnapshot(
            id: $pattern->id,
            projectId: $project->id,
            document: $pattern->geometry,
            version: (int) ($latest?->version ?? 0),
            savedAt: $latest?->created_at,
        );
    }

    /**
     * Store the document and append a checkpoint for every change.
     *
     * The project row is locked first so two concurrent first saves cannot
     * create two patterns; the pattern row is then locked for version numbering.
     *
     * @param  array<string, mixed>  $document
     *
     * @throws PatternConflictException when the expected version is stale
     */
    public function save(
        Project $project,
        array $document,
        ?int $expectedVersion,
        ?string $expectedSchema,
        string $origin = PatternVersion::ORIGIN_MANUAL,
    ): PatternSaveResult {
        return DB::transaction(function () use ($project, $document, $expectedVersion, $expectedSchema, $origin) {
            $project->newQuery()->whereKey($project->getKey())->lockForUpdate()->first();

            $pattern = $this->patternFor($project);
            $created = false;

            if ($pattern === null) {
                $pattern = $project->patterns()->create([
                    'geometry' => null,
                ]);
                $created = true;
            }

            $pattern = Pattern::query()->whereKey($pattern->getKey())->lockForUpdate()->firstOrFail();
            $latest = $this->latestVersion($pattern);
            $version = (int) ($latest?->version ?? 0);

            if ($expectedVersion !== null && $expectedVersion !== $version) {
                throw new PatternConflictException($version, $latest?->created_at);
            }

            $archived = false;

            if (
                $expectedSchema !== null
                && $expectedSchema !== $document['schema']
                && $pattern->geometry !== null
            ) {
                $version++;
                $this->append($pattern, $version, $pattern->geometry, PatternVersion::ORIGIN_MANUAL);
                $archived = true;
            }

            $checkpoint = null;
            $unchanged = ! $archived
                && $pattern->geometry !== null
                && $this->serialise($pattern->geometry) === $this->serialise($document);

            if (! $unchanged) {
                $pattern->geometry = $document;
                $pattern->save();

                $version++;
                $checkpoint = $this->append($pattern, $version, $document, $origin);
            }

            $savedAt = $checkpoint?->created_at ?? $latest?->created_at;

            return new PatternSaveResult(
                id: $pattern->id,
                version: $version,
                savedAt: $savedAt ?? Carbon::now(),
                created: $created,
            );
        });
    }

    private function patternFor(Project $project): ?Pattern
    {
        return $project->patterns()->orderBy('id')->first();
    }

    private function latestVersion(Pattern $pattern): ?PatternVersion
    {
        return $pattern->versions()->orderByDesc('version')->first();
    }

    /**
     * Append one checkpoint. An autosave row is transient history: earlier
     * autosave rows of the same pattern are pruned in the same transaction so a
     * drafting session cannot flood history. Manual rows (explicit saves and
     * upgrade archives) are never pruned.
     *
     * @param  array<string, mixed>  $document
     */
    private function append(
        Pattern $pattern,
        int $version,
        array $document,
        string $origin,
    ): PatternVersion {
        $checkpoint = PatternVersion::create([
            'pattern_id' => $pattern->id,
            'version' => $version,
            'geometry' => $document,
            'origin' => $origin,
        ])->refresh();

        if ($origin === PatternVersion::ORIGIN_AUTOSAVE) {
            $pattern->versions()
                ->where('origin', PatternVersion::ORIGIN_AUTOSAVE)
                ->whereKeyNot($checkpoint->getKey())
                ->delete();
        }

        return $checkpoint;
    }

    /**
     * @param  array<string, mixed>  $document
     */
    private function serialise(array $document): string
    {
        return (string) json_encode($this->canonicalise($document));
    }

    /**
     * Sort object keys recursively so a semantically unchanged document is not
     * mistaken for a change when a client serialises its keys in a new order.
     * List order is preserved: entity order is part of the document.
     */
    private function canonicalise(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        $canonical = array_map(fn (mixed $item): mixed => $this->canonicalise($item), $value);

        if (array_is_list($canonical)) {
            return $canonical;
        }

        ksort($canonical);

        return $canonical;
    }
}
