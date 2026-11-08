<?php

use App\Models\User;
use Illuminate\Support\Facades\Hash;

it('registers with an email and password and returns a token', function () {
    $response = $this->postJson('/api/register', [
        'email' => 'Maker@Example.com',
        'password' => 'correct-horse',
        'password_confirmation' => 'correct-horse',
    ]);

    $response->assertCreated()
        ->assertJsonPath('data.user.email', 'maker@example.com')
        ->assertJsonPath('data.user.name', 'maker')
        ->assertJsonStructure(['data' => ['user' => ['id', 'email'], 'token']]);

    $user = User::sole();
    expect($user->email)->toBe('maker@example.com')
        ->and(Hash::check('correct-horse', $user->password))->toBeTrue();

    $this->withHeader('Authorization', 'Bearer '.$response->json('data.token'))
        ->getJson('/api/user')
        ->assertOk()
        ->assertJsonPath('data.email', 'maker@example.com');
});

it('rejects a duplicate email', function () {
    User::factory()->create(['email' => 'taken@example.com']);

    $this->postJson('/api/register', [
        'email' => 'TAKEN@example.com',
        'password' => 'correct-horse',
        'password_confirmation' => 'correct-horse',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('email');
});

it('rejects a short or unconfirmed password', function () {
    $this->postJson('/api/register', [
        'email' => 'maker@example.com',
        'password' => 'short',
        'password_confirmation' => 'short',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('password');

    $this->postJson('/api/register', [
        'email' => 'maker@example.com',
        'password' => 'correct-horse',
        'password_confirmation' => 'different',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('password');

    expect(User::count())->toBe(0);
});

it('logs in with valid credentials', function () {
    User::factory()->create([
        'email' => 'maker@example.com',
        'password' => 'correct-horse',
    ]);

    $response = $this->postJson('/api/login', [
        'email' => 'MAKER@example.com',
        'password' => 'correct-horse',
    ]);

    $response->assertOk()
        ->assertJsonPath('data.user.email', 'maker@example.com')
        ->assertJsonStructure(['data' => ['token']]);

    $this->withHeader('Authorization', 'Bearer '.$response->json('data.token'))
        ->getJson('/api/user')
        ->assertOk();
});

it('rejects bad credentials', function () {
    User::factory()->create([
        'email' => 'maker@example.com',
        'password' => 'correct-horse',
    ]);

    $this->postJson('/api/login', [
        'email' => 'maker@example.com',
        'password' => 'wrong',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('email');

    $this->postJson('/api/login', [
        'email' => 'missing@example.com',
        'password' => 'correct-horse',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('email');
});

it('logs out by deleting the current token', function () {
    $user = User::factory()->create([
        'email' => 'maker@example.com',
        'password' => 'correct-horse',
    ]);
    $token = $user->createToken('spa')->plainTextToken;

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->postJson('/api/logout')
        ->assertNoContent();

    expect($user->tokens()->count())->toBe(0);
});

it('keeps every project route behind authentication', function () {
    $this->getJson('/api/projects')->assertUnauthorized();
    $this->getJson('/api/user')->assertUnauthorized();
    $this->postJson('/api/logout')->assertUnauthorized();
});

it('keeps the command spec public', function () {
    $this->getJson('/api/commands')->assertOk();
});
