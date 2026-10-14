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

it('exposes the construction commands', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_construction_line.params.start', 'entity_id')
        ->assertJsonPath('commands.set_construction.params.construction', 'bool')
        ->assertJsonPath('commands.set_construction.inverse', 'set_construction');
});
