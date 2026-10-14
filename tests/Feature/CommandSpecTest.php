<?php

it('exposes the command spec', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('version', '0.1.0')
        ->assertJsonStructure([
            'version',
            'commands' => [
                'add_point',
                'add_constraint',
                'solve',
            ],
        ]);
});
