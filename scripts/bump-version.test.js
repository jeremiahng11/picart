/* Plain Node test. react-scripts pins Jest's roots to src/ and does not allow
 * overriding it, so this runs via `npm run test-version` instead.
 */

const assert = require('assert');
const { nextVersion } = require('./bump-version');

let failures = 0;

function check(name, fn) {
    try {
        fn();
        console.log('  ok   ' + name);
    }
    catch (e) {
        failures += 1;
        console.log('  FAIL ' + name);
        console.log('       ' + e.message);
    }
}

check('increments the patch component', () => {
    assert.strictEqual(nextVersion('1.0.0'), '1.0.1');
    assert.strictEqual(nextVersion('1.0.7'), '1.0.8');
});

check('rolls the patch over at nine into the minor', () => {
    assert.strictEqual(nextVersion('1.0.9'), '1.1.0');
    assert.strictEqual(nextVersion('0.5.9'), '0.6.0');
});

check('rolls the minor over at nine into the major', () => {
    assert.strictEqual(nextVersion('1.9.9'), '2.0.0');
    assert.strictEqual(nextVersion('0.9.9'), '1.0.0');
});

check('does not roll a minor of nine while the patch still has room', () => {
    assert.strictEqual(nextVersion('1.9.0'), '1.9.1');
    assert.strictEqual(nextVersion('1.9.8'), '1.9.9');
});

check('carries past the ninth major', () => {
    assert.strictEqual(nextVersion('9.9.9'), '10.0.0');
});

check('drops a prerelease or build suffix left by a tagged release', () => {
    assert.strictEqual(nextVersion('1.2.3-alpha.1'), '1.2.4');
    assert.strictEqual(nextVersion('1.0.9+build7'), '1.1.0');
});

check('rejects a version it cannot parse', () => {
    assert.throws(() => nextVersion('1.0'), /Cannot parse/);
    assert.throws(() => nextVersion('not.a.version'), /Cannot parse/);
    assert.throws(() => nextVersion(''), /Cannot parse/);
});

if (failures > 0) {
    console.error('\n' + failures + ' version bump test(s) failed');
    process.exit(1);
}

console.log('\nversion bump: all checks passed');
