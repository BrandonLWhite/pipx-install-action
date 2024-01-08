const core = require('@actions/core')
const { saveCache, restoreCache } = require('@actions/cache')
const { exec, getExecOutput } = require('@actions/exec')

const fs = require('fs/promises')
const path = require('path')
const crypto = require('crypto')

const TOML = require('@iarna/toml')
const semver = require('semver')

/**
Note: There is currently a bug in actions/toolkit/cache where it is mutating the array of paths that are passed into
      restoreCache such that a subsequent call to saveCache utilizes a different array of keys.
      See https://github.com/actions/toolkit/issues/1579
      and https://github.com/actions/toolkit/blob/main/packages/cache/src/internal/cacheHttpClient.ts#L88C13-L88C13
*/
module.exports = {
  pipxInstall
}

const MIN_PIPX_VERSION = '1.1.0'

async function pipxInstall(options) {
  const { installConfigFile, cachePackages } = options
  core.info(`Reading ${installConfigFile}...`)

  const projectToml = await fs.readFile(installConfigFile)
  const projectParsed = TOML.parse(projectToml)

  const installPackages = projectParsed?.tool?.['pipx-install']
  if (!installPackages) {
    core.info('Nothing to install.')
    return
  }

  const pipxVersion = (await getExecOutput('pipx', ['--version'])).stdout.trim()

  if (semver.lt(pipxVersion, MIN_PIPX_VERSION)) {
    throw new Error(
      `Current Pipx version ${pipxVersion} does not meet minimum requirement of at least ${MIN_PIPX_VERSION}`
    )
  }

  const pipxBinDir = await getPipxEnv('PIPX_BIN_DIR')
  const pipxSharedDir = await getPipxEnv('PIPX_SHARED_LIBS')
  const pipxVenvsDir = await getPipxEnv('PIPX_LOCAL_VENVS')

  const pythonVersion = (
    await getExecOutput('python', ['--version'])
  ).stdout.trim()
  const systemHashInput = {
    pipx: pipxVersion,
    python: pythonVersion
  }

  const pipxSharedCacheKey = `pipx-install-shared-${hashObject(
    systemHashInput
  )}`
  const pipxSharedCacheHit =
    cachePackages && (await restoreCache([pipxSharedDir], pipxSharedCacheKey))

  for (const [packageName, packageValue] of Object.entries(installPackages)) {
    const packageInfo = getNormalizedPackageInfo(packageName, packageValue)
    const cacheHashInput = {
      ...packageInfo,
      ...systemHashInput
    }
    const cacheKey = `pipx-install-${packageInfo.name}-${hashObject(
      cacheHashInput
    )}`
    const venvPath = path.join(pipxVenvsDir, packageInfo.name)
    const cacheHit = cachePackages && (await restoreCache([venvPath], cacheKey))

    if (cacheHit) {
      const packageSpec = packageInfo.name + packageInfo.version
      core.info(`"${packageSpec}" restored from cache. Skipping install.`)

      // Recreate the command symlinks
      await createCommandSymlinks(packageInfo.name, pipxBinDir)
    } else {
      await installPackage(packageInfo)

      if (cachePackages) {
        await saveCache([venvPath], cacheKey)
      }
    }
  }

  if (cachePackages && !pipxSharedCacheHit) {
    await saveCache([pipxSharedDir], pipxSharedCacheKey)
  }
}

function getNormalizedPackageInfo(packageName, packageValue) {
  const packageVersion = getNormalizedPackageVersion(packageName, packageValue)

  const injectPackages = Object.entries(packageValue.inject || {}).map(
    ([injectPackageName, injectPackageValue]) =>
      getNormalizedPackageVersion(injectPackageName, injectPackageValue)
  )

  return {
    ...packageVersion,
    inject: injectPackages
  }
}

function getNormalizedPackageVersion(packageName, packageValue) {
  if (typeof packageValue === 'string') {
    return {
      name: packageName,
      version: packageValue
    }
  }

  if (!packageValue.version) {
    throw new Error(
      `The "version" field must be specified for package "${packageName}"`
    )
  }

  return {
    name: packageName,
    version: packageValue.version
  }
}

async function getPipxEnv(name) {
  return (
    await getExecOutput('pipx', ['environment', '--value', name])
  ).stdout.trim()
}

async function getInstalledPackageMetadata(packageName) {
  const pipxListOutput = await getExecOutput('pipx', ['list', '--json'])
  const pipxList = JSON.parse(pipxListOutput.stdout)
  return pipxList.venvs[packageName].metadata
}

function hashObject(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function createCommandSymlinks(packageName, pipxBinDir) {
  const pipxMeta = await getInstalledPackageMetadata(packageName)
  const commandPaths = pipxMeta.main_package.app_paths || []
  for (const commandPath of commandPaths) {
    const targetPath = commandPath.__Path__
    const symlinkPath = path.join(pipxBinDir, path.basename(targetPath))
    await fs.symlink(targetPath, symlinkPath)
  }
}

async function installPackage(packageInfo) {
  const packageSpec = packageInfo.name + packageInfo.version
  core.info(`Installing "${packageSpec}" ...`)
  await exec('pipx', ['install', packageSpec])

  for (const injectPackage of packageInfo.inject) {
    const injectSpec = injectPackage.name + injectPackage.version
    core.info(`Injecting "${injectSpec}" into ${packageInfo.name}...`)
    await exec('pipx', ['inject', packageInfo.name, injectSpec])
  }

  const pipxMeta = await getInstalledPackageMetadata(packageInfo.name)
  const installedCommands = pipxMeta.main_package.apps || []

  core.info(
    `Package "${packageSpec}" installed with commands [${installedCommands}] using "${pipxMeta.python_version}" ...`
  )
}
