const core = require('@actions/core');
const {exec} = require('@actions/exec');

const fs = require('fs/promises');
// const path = require('path');
const TOML = require('@iarna/toml');
const { consumers } = require('stream');

/**
TODO BW:
- Caching. Use the package name, version, and ambient Python version to hash.  Maybe pipx version too?
- Get pipx installation info.
- inject

pipx --version
pipx list --json
pipx environment
    PIPX_HOME=/home/brandon/.local/pipx
    PIPX_BIN_DIR=/home/brandon/.local/bin
    PIPX_SHARED_LIBS=/home/brandon/.local/pipx/shared
    PIPX_LOCAL_VENVS=/home/brandon/.local/pipx/venvs
    PIPX_LOG_DIR=/home/brandon/.local/pipx/logs
    PIPX_TRASH_DIR=/home/brandon/.local/pipx/.trash
    PIPX_VENV_CACHEDIR=/home/brandon/.local/pipx/.cache

- Tricky: Need to figure out how to get the bin name for a package so that it can be restored from the cache.
          This is tricky because how are you supposed to know the bin command without installing the package first?

TODO Docs:
- Version must be specified like: https://packaging.python.org/en/latest/specifications/version-specifiers/#version-specifiers
*/
module.exports = async function pipxInstall(pyprojectFile) {
    core.info(`Reading ${pyprojectFile}...`)

    const projectToml = await fs.readFile(pyprojectFile);
    const projectParsed = TOML.parse(projectToml);
    // core.info(projectParsed);

    const installPackages = projectParsed?.tool?.['pipx-install'];
    if (!installPackages) {
        core.info('Nothing to install.');
        return;
    }

    for (const [packageName, packageValue] of Object.entries(installPackages)) {

        // TODO BW: Extract function.  Always return an object.
        let versionSpec = packageValue;
        if(typeof packageValue === "object") {
            versionSpec = packageValue.version;
            if(!versionSpec) {
                throw `The "version" field must be specified for package "${packageName}"`;
            }
            // TODO BW: Parse out other fields.
        }
        core.info(`Installing "${packageName}" ${versionSpec} ...`);
        await exec('pipx',['install', `${packageName}${versionSpec}`]);
    }
}