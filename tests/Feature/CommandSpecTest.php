<?php

it('exposes the command spec', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('version', '0.12.0')
        ->assertJsonStructure([
            'version',
            'commands' => [
                'add_point',
                'add_constraint',
                'solve',
            ],
        ]);
});

it('exposes dimension presentation and update params', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_constraint.params.orientation', 'aligned|horizontal|vertical?')
        ->assertJsonPath('commands.add_constraint.params.offset', 'number?')
        ->assertJsonPath('commands.add_constraint.params.value', 'number?')
        ->assertJsonPath('commands.update_constraint.params.id', 'entity_id')
        ->assertJsonPath('commands.update_constraint.params.value', 'number|null?')
        ->assertJsonPath('commands.update_constraint.inverse', 'update_constraint');
});

it('exposes the seam allowance update command', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_seam_allowance.params.side', 'left|right?')
        ->assertJsonPath('commands.set_seam_allowance.params.id', 'entity_id')
        ->assertJsonPath('commands.set_seam_allowance.params.width', 'number?')
        ->assertJsonPath('commands.set_seam_allowance.params.side', 'left|right?')
        ->assertJsonPath('commands.set_seam_allowance.inverse', 'set_seam_allowance');
});

it('exposes the construction commands', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_construction_line.params.start', 'entity_id')
        ->assertJsonPath('commands.set_construction.params.construction', 'bool')
        ->assertJsonPath('commands.set_construction.inverse', 'set_construction');
});

it('exposes the corner round commands', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_corner_round.params.first', 'entity_id')
        ->assertJsonPath('commands.add_corner_round.params.second', 'entity_id')
        ->assertJsonPath('commands.add_corner_round.params.radius', 'number')
        ->assertJsonPath('commands.add_corner_round.inverse', 'remove_corner_round')
        ->assertJsonPath('commands.set_corner_round_radius.params.id', 'entity_id')
        ->assertJsonPath('commands.set_corner_round_radius.params.radius', 'number')
        ->assertJsonPath('commands.set_corner_round_radius.inverse', 'set_corner_round_radius')
        ->assertJsonPath('commands.remove_corner_round.params.id', 'entity_id')
        ->assertJsonPath('commands.remove_corner_round.inverse', 'add_corner_round');
});

it('exposes the arc command', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_arc.params.start', 'entity_id')
        ->assertJsonPath('commands.add_arc.params.end', 'entity_id')
        ->assertJsonPath('commands.add_arc.params.through', 'entity_id')
        ->assertJsonPath('commands.add_arc.params.construction', 'bool?')
        ->assertJsonPath('commands.add_arc.inverse', 'delete_entity');
});

it('exposes the circle command', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_circle.params.center', 'entity_id')
        ->assertJsonPath('commands.add_circle.params.rim', 'entity_id')
        ->assertJsonPath('commands.add_circle.params.construction', 'bool?')
        ->assertJsonPath('commands.add_circle.inverse', 'delete_entity');
});

it('exposes the piece commands', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.create_piece.params.edges', 'entity_id[]')
        ->assertJsonPath('commands.create_piece.params.name', 'string?')
        ->assertJsonPath('commands.create_piece.params.quantity', 'int?')
        ->assertJsonPath('commands.create_piece.params.allowance', 'default|none|preset?')
        ->assertJsonPath('commands.create_piece.inverse', 'delete_piece')
        ->assertJsonPath('commands.update_piece.params.name', 'string|null?')
        ->assertJsonPath('commands.update_piece.params.quantity', 'int|null?')
        ->assertJsonPath('commands.update_piece.inverse', 'update_piece')
        ->assertJsonPath('commands.delete_piece.params.id', 'entity_id')
        ->assertJsonPath('commands.set_piece_allowance.params.piece', 'entity_id')
        ->assertJsonPath('commands.set_piece_allowance.params.edge', 'entity_id')
        ->assertJsonPath('commands.set_piece_allowance.params.width', 'number?')
        ->assertJsonPath('commands.set_piece_allowance.params.kind', 'seam|single|double?')
        ->assertJsonPath('commands.set_piece_allowance.params.remove', 'bool?')
        ->assertJsonPath('commands.set_piece_allowance.inverse', 'set_piece_allowance');
});

it('exposes the default allowance command', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.set_default_allowance.params.width', 'number?')
        ->assertJsonPath('commands.set_default_allowance.params.kind', 'seam|single|double?')
        ->assertJsonPath('commands.set_default_allowance.params.remove', 'bool?')
        ->assertJsonPath('commands.set_default_allowance.inverse', 'set_default_allowance');
});

it('exposes the derived cut dimension command', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_derived_dimension.params.piece', 'entity_id')
        ->assertJsonPath('commands.add_derived_dimension.params.a', 'cut_anchor { edge: entity_id, at: start|end|edge }')
        ->assertJsonPath('commands.add_derived_dimension.params.b', 'cut_anchor { edge: entity_id, at: start|end|edge }')
        ->assertJsonPath('commands.add_derived_dimension.params.orientation', 'aligned|horizontal|vertical?')
        ->assertJsonPath('commands.add_derived_dimension.params.offset', 'number?')
        ->assertJsonPath('commands.add_derived_dimension.inverse', 'remove_constraint');
});
