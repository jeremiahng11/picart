/* Computes the next version, rolling each component over at 9 so that 1.0.9 is
 * followed by 1.1.0 rather than 1.0.10, and 1.9.9 by 2.0.0.
 *
 * Run with no arguments to print the next version for package.json.
 */

function nextVersion(version) {
    // A tagged release can leave a prerelease suffix behind; only the numeric
    // core participates in the rollover.
    const core = String(version).split('-')[0].split('+')[0];
    const parts = core.split('.').map(Number);

    if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
        throw new Error('Cannot parse version "' + version + '"');
    }

    let [major, minor, patch] = parts;

    patch += 1;
    if (patch > 9) {
        patch = 0;
        minor += 1;
    }
    if (minor > 9) {
        minor = 0;
        major += 1;
    }

    return [major, minor, patch].join('.');
}

module.exports = { nextVersion };

if (require.main === module) {
    const pkg = require('../package.json');
    process.stdout.write(nextVersion(pkg.version));
}
