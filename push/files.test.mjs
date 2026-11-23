// Run with: node push/files.test.mjs
import assert from 'assert';
import { kindOf, mayAccess, threadOk, LIMITS } from './files.mjs';

assert.equal(kindOf('image/jpeg'), 'image');
assert.equal(kindOf('audio/webm;codecs=opus'), 'audio');
assert.equal(kindOf('audio/mp4'), 'audio');
assert.equal(kindOf('video/quicktime'), 'video');
assert.equal(kindOf('application/pdf'), 'file');
assert.equal(kindOf('text/html'), null, 'kein HTML (könnte Skripte enthalten)');
assert.equal(kindOf('image/svg+xml'), null, 'kein SVG (könnte Skripte enthalten)');
assert.equal(kindOf(''), null);

const k = 'chat/abc123/0f8fad5b-d9cb-469f-a165-70867728950e';
assert.ok(mayAccess('abc123', false, k), 'eigener Chat');
assert.ok(!mayAccess('other', false, k), 'fremder Chat');
assert.ok(mayAccess('dev', true, k), 'Entwickler');
assert.ok(!mayAccess('abc123', false, 'chat/abc123/../x'), 'kein Pfad-Trick');
assert.ok(!mayAccess('abc123', false, 'kunde:abc123'), 'nur Chat-Dateien');
assert.ok(threadOk('Pb3LEKsVdveCrDdWyhuqOkoNcc63') && !threadOk('a/b') && !threadOk(''));
assert.ok(LIMITS.video > LIMITS.image);
console.log('files ok');
