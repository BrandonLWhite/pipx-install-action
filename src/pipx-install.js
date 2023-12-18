const core = require('@actions/core');
const {saveCache, restoreCache} = require('@actions/cache');
const {exec, getExecOutput} = require('@actions/exec');

const fs = require('fs/promises');
const path = require('path');
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
          I think you can restore a cache using a path, so the idea would be to restore everything fro the /pipx/bin path
          No, this does not seem to be working. Each path that is passed to saveCache is hashed to form the key, so you
          have to know each path up front in order to restore.
- Alternative: Just cache/restore the venv, and manually do symlink after a restore. Use fsPromises.symlink(target, path[, type])
               https://nodejs.org/api/fs.html#fspromisessymlinktarget-path-type

TODO Docs:
- Version must be specified like: https://packaging.python.org/en/latest/specifications/version-specifiers/#version-specifiers

Note: There is currently a bug in actions/toolkit/cache where it is mutating the array of paths that are passed into
      restoreCache such that a subsequent call to saveCache utilizes a different array of keys.
      See https://github.com/actions/toolkit/issues/1579
      and https://github.com/actions/toolkit/blob/main/packages/cache/src/internal/cacheHttpClient.ts#L88C13-L88C13
*/
module.exports = async function pipxInstall(pyprojectFile) {
    core.info(`Reading ${pyprojectFile}...`)

    const projectToml = await fs.readFile(pyprojectFile);
    const projectParsed = TOML.parse(projectToml);

    const installPackages = projectParsed?.tool?.['pipx-install'];
    if (!installPackages) {
        core.info('Nothing to install.');
        return;
    }

    const pipxVersion = (await getExecOutput('pipx',['--version'])).stdout.trim();
    const pythonVersion = (await getExecOutput('python',['--version'])).stdout.trim();

    const PIPX_SHARED_LIBS='/root/.local/share/pipx/shared'; // TEMP HACK
    const PIPX_LOCAL_VENVS='/root/.local/share/pipx/venvs'; // TEMP HACK

    const pipxSharedCacheKey = `pipx-shared`; // TEMP HACK
    const pipxSharedCacheHit = await restoreCache([PIPX_SHARED_LIBS], pipxSharedCacheKey); // What is wrong with this?!

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
        const packageSpec = packageName + versionSpec
        // TODO: Need to rework cacheKey to also include any injects.  Probably time to switch to a hash.
        // const cacheKey = `pipx-install:${packageSpec}:pipx==${pipxVersion}:python=${pythonVersion}`;
        const cacheKey = `pipx-install-${packageName}`; // TEMP HACK
        const venvPath = path.join(PIPX_LOCAL_VENVS, packageName);
        const cacheHit = await restoreCache([venvPath], cacheKey);

        if(cacheHit) {
            core.info(`Restored from cache. Skipping install`);

            const pipxMeta = await getPackageMetadata(packageName);
            const commandPaths = pipxMeta.main_package.app_paths || [];
            for(const commandPath of commandPaths) {
                const targetPath = commandPath.__Path__;
                const symlinkPath = path.join('/root/.local/bin', path.basename(targetPath));
                await fs.symlink(targetPath, symlinkPath);
            }

            continue;
        }

        core.info(`Installing "${packageSpec}" ...`);
        await exec('pipx',['install', packageSpec]);

        // TODO: Probably do this if cache enabled (default True)
        // See what was installed.
        const pipxMeta = await getPackageMetadata(packageName);
        const installedCommands = pipxMeta.main_package.apps || [];

        core.info(`Package "${packageSpec}" installed with commands [${installedCommands}] using ${pythonVersion}...`);

        await saveCache([venvPath], cacheKey);
    }

    if (!pipxSharedCacheHit) {
        await saveCache([PIPX_SHARED_LIBS], pipxSharedCacheKey);
    }
}

async function getPackageMetadata(packageName) {
    const pipxListOutput = await getExecOutput('pipx',['list', '--json']);
    const pipxList = JSON.parse(pipxListOutput.stdout);
    return pipxList.venvs[packageName].metadata;
}