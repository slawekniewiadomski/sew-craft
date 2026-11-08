<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProjectResource;
use App\Models\Project;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ProjectController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return ProjectResource::collection(
            Project::query()->with('user')->latest()->paginate()
        )->additional([
            'my_project_count' => $request->user()->projects()->count(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
        ]);

        $project = DB::transaction(function () use ($request, $validated): Project {
            // Serialise creates per account so two simultaneous requests cannot
            // both pass the limit check and land a fourth project.
            $user = User::query()->whereKey($request->user()->id)->lockForUpdate()->firstOrFail();

            if ($user->projects()->count() >= Project::MAX_PER_USER) {
                throw ValidationException::withMessages([
                    'name' => 'You can have at most '.Project::MAX_PER_USER.' projects.',
                ]);
            }

            return $user->projects()->create($validated);
        });

        return ProjectResource::make($project->load('user'))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Project $project): ProjectResource
    {
        return ProjectResource::make($project->load('user'));
    }

    public function update(Request $request, Project $project): ProjectResource
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
        ]);

        $project->update($validated);

        return ProjectResource::make($project->load('user'));
    }

    public function destroy(Project $project): JsonResponse
    {
        $project->delete();

        return response()->json(status: 204);
    }
}
