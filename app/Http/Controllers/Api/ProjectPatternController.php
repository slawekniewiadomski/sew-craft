<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\PatternConflictException;
use App\Http\Controllers\Controller;
use App\Http\Requests\SavePatternRequest;
use App\Http\Resources\PatternResource;
use App\Models\Project;
use App\Services\PatternPersistence;
use Illuminate\Http\JsonResponse;

class ProjectPatternController extends Controller
{
    public function show(Project $project, PatternPersistence $patterns): PatternResource
    {
        return PatternResource::make($patterns->snapshot($project));
    }

    public function update(
        SavePatternRequest $request,
        Project $project,
        PatternPersistence $patterns,
    ): JsonResponse {
        try {
            $result = $patterns->save(
                $project,
                $request->input('document'),
                $request->validated('expected_version'),
                $request->validated('expected_schema'),
            );
        } catch (PatternConflictException $conflict) {
            return response()->json([
                'message' => $conflict->getMessage(),
                'current_version' => $conflict->currentVersion,
                'saved_at' => $conflict->savedAt?->toIso8601ZuluString(),
            ], 409);
        }

        return response()->json([
            'data' => [
                'id' => $result->id,
                'version' => $result->version,
                'saved_at' => $result->savedAt->toIso8601ZuluString(),
                'created' => $result->created,
            ],
        ]);
    }
}
