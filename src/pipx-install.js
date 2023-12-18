const core = require('@actions/core');
const {saveCache, restoreCache} = require('@actions/cache');
const {exec, getExecOutput} = require('@actions/exec');

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const TOML = require('@iarna/toml');
const semver = require('semver');

/**
TODO BW:
- Get pipx installation info.
- inject

pipx environment
    PIPX_HOME=/home/brandon/.local/pipx
    PIPX_BIN_DIR=/home/brandon/.local/bin
    PIPX_SHARED_LIBS=/home/brandon/.local/pipx/shared
    PIPX_LOCAL_VENVS=/home/brandon/.local/pipx/venvs
    PIPX_LOG_DIR=/home/brandon/.local/pipx/logs
    PIPX_TRASH_DIR=/home/brandon/.local/pipx/.trash
    PIPX_VENV_CACHEDIR=/home/brandon/.local/pipx/.cache

TODO Docs:
- Version must be specified like: https://packaging.python.org/en/latest/specifications/version-specifiers/#version-specifiers

Note: There is currently a bug in actions/toolkit/cache where it is mutating the array of paths that are passed into
      restoreCache such that a subsequent call to saveCache utilizes a different array of keys.
      See https://github.com/actions/toolkit/issues/1579
      and https://github.com/actions/toolkit/blob/main/packages/cache/src/internal/cacheHttpClient.ts#L88C13-L88C13
*/
module.exports = {
    pipxInstall
}

const MIN_PIPX_VERSION = "1.1.0";

async function pipxInstall(pyprojectFile) {
    core.info(`Reading ${pyprojectFile}...`)

    const projectToml = await fs.readFile(pyprojectFile);
    const projectParsed = TOML.parse(projectToml);

    const installPackages = projectParsed?.tool?.['pipx-install'];
    if (!installPackages) {
        core.info('Nothing to install.');
        return;
    }

    const pipxVersion = (await getExecOutput('pipx',['--version'])).stdout.trim();

    if(semver.lt(pipxVersion, MIN_PIPX_VERSION)) {
        throw new Error(`Current Pipx version ${pipxVersion} does not meet minimum requirement of at least ${MIN_PIPX_VERSION}`);
    }

    const pythonVersion = (await getExecOutput('python',['--version'])).stdout.trim();
    const systemHashInput = {
        pipx: pipxVersion,
        python: pythonVersion
    }

    const PIPX_SHARED_LIBS='/root/.local/share/pipx/shared'; // TEMP HACK
    const PIPX_LOCAL_VENVS='/root/.local/share/pipx/venvs'; // TEMP HACK

    const pipxSharedCacheKey = `pipx-shared-${hashObject(systemHashInput)}`;
    const pipxSharedCacheHit = await restoreCache([PIPX_SHARED_LIBS], pipxSharedCacheKey);

    for (const [packageName, packageValue] of Object.entries(installPackages)) {
        const packageInfo = getNormalizedPackageInfo(packageName, packageValue);
        const cacheHashInput = {
            ...packageInfo,
            ...systemHashInput
        }
        const cacheKey = `pipx-install-${packageInfo.name}-${hashObject(cacheHashInput)}`;
        const venvPath = path.join(PIPX_LOCAL_VENVS, packageInfo.name);
        const cacheHit = await restoreCache([venvPath], cacheKey);

        if(cacheHit) {
            core.info(`Restored from cache. Skipping install`);

            const pipxMeta = await getInstalledPackageMetadata(packageInfo.name);
            const commandPaths = pipxMeta.main_package.app_paths || [];
            for(const commandPath of commandPaths) {
                const targetPath = commandPath.__Path__;
                const symlinkPath = path.join('/root/.local/bin', path.basename(targetPath));
                await fs.symlink(targetPath, symlinkPath);
            }
        }
        else {
            const packageSpec = packageInfo.name + packageInfo.version
            core.info(`Installing "${packageSpec}" ...`);
            await exec('pipx',['install', packageSpec]);

            // TODO: Probably do this if cache enabled (default True)
            // See what was installed.
            const pipxMeta = await getInstalledPackageMetadata(packageInfo.name);
            const installedCommands = pipxMeta.main_package.apps || [];

            core.info(`Package "${packageSpec}" installed with commands [${installedCommands}] using ${pythonVersion}...`);

            await saveCache([venvPath], cacheKey);
        }
    }

    if (!pipxSharedCacheHit) {
        await saveCache([PIPX_SHARED_LIBS], pipxSharedCacheKey);
    }
}

function getNormalizedPackageInfo(packageName, packageValue) {
    if(typeof packageValue === "string") {
        return {
            name: packageName,
            version: packageValue
        }
    }

    if(!packageValue.version) {
        throw new Error(`The "version" field must be specified for package "${packageName}"`);
    }

    return {
        name: packageName,
        version: packageValue.version
        // TODO: injects.
    }
}

async function getInstalledPackageMetadata(packageName) {
    const pipxListOutput = await getExecOutput('pipx',['list', '--json']);
    const pipxList = JSON.parse(pipxListOutput.stdout);
    return pipxList.venvs[packageName].metadata;
}

function hashObject(value) {
    return crypto.createHash('sha256')
        .update(JSON.stringify(value))
        .digest('hex');
}