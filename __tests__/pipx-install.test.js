const path = require('path')
const fs = require('fs/promises')

const actionsCache = require('@actions/cache')
const actionsExec = require('@actions/exec')
const core = require('@actions/core')

const infoMock = jest.spyOn(core, 'info').mockImplementation()

const saveCacheMock = jest.spyOn(actionsCache, 'saveCache').mockImplementation()
const restoreCacheMock = jest
  .spyOn(actionsCache, 'restoreCache')
  .mockImplementation()

const execMock = jest.spyOn(actionsExec, 'exec').mockImplementation()
const getExecOutputMock = jest
  .spyOn(actionsExec, 'getExecOutput')
  .mockImplementation()

const testDataDir = path.join(__dirname, 'data')
const packageSpecRegExp = new RegExp('(\\w+)(~=|===|==|!=|<=|>=|<|>)?')

function getPyprojectFile(name) {
  return path.join(testDataDir, name)
}

describe('pipx-install', () => {
  const { pipxInstall } = require('../src/pipx-install')
  const originalEnv = process.env
  let pipxVersion
  let cache = {}
  function addCache(key, callback = null) {
    cache[key] = callback || (() => {})
  }

  let venvs = {}
  function addVenv(packageName) {
    venvs[packageName] = {
      metadata: {
        python_version: 'Python 3.11.5',
        main_package: {
          apps: [`${packageName}-app`],
          app_paths: [
            {
              __Path__: `/fake/path/to/${packageName}-app`
            }
          ]
        }
      }
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv } // Deep copy the original environment so we can alter it and then put the original back when we are done
    pipxVersion = '1.1.1'
    cache = {}
    venvs = {}

    async function mockExec(command, args) {
      let stdout = null
      if (command === 'pipx') {
        const pipxCommand = args[0]
        if (pipxCommand === '--version') {
          stdout = pipxVersion
        } else if (pipxCommand === 'environment') {
          stdout = `${args[2]}-FAKE-VALUE`
        } else if (pipxCommand === 'install') {
          const packageSpec = args[1]
          const matchResult = packageSpec.match(packageSpecRegExp)
          const packageName = matchResult[1]
          addVenv(packageName)
        } else if (pipxCommand === 'list') {
          stdout = JSON.stringify({ venvs })
        }
      } else if (command === 'PIPX_DEFAULT_PYTHON-FAKE-VALUE') {
        if (args[0] === '--version') {
          stdout = 'Python 3.11.5'
        }
      }

      return { stdout }
    }

    getExecOutputMock.mockImplementation(mockExec)
    execMock.mockImplementation(mockExec)

    restoreCacheMock.mockImplementation(async (paths, cacheKey) => {
      const cacheValue = cache[cacheKey]
      if (cacheValue) {
        cacheValue()
        return 'HIT'
      }
      return null
    })
  })

  afterEach(() => {
    process.env = originalEnv // Restore the original environment
  })

  it('installs using pipx (caching)', async () => {
    await pipxInstall({
      installConfigFile: getPyprojectFile('pyproject.test1.toml'),
      cachePackages: true
    })

    expect(execMock).toHaveBeenNthCalledWith(1, 'pipx', [
      'install',
      'poetry==1.7.1'
    ])
    expect(execMock).toHaveBeenNthCalledWith(2, 'pipx', [
      'inject',
      'poetry',
      'poetry-plugin-bundle==1.3.0'
    ])
    expect(execMock).toHaveBeenNthCalledWith(3, 'pipx', [
      'install',
      'tox~=4.11.4'
    ])
    expect(execMock).toHaveBeenNthCalledWith(4, 'pipx', [
      'install',
      'poethepoet~=0.24.4'
    ])

    expect(saveCacheMock).toHaveBeenCalledWith(
      ['PIPX_LOCAL_VENVS-FAKE-VALUE/poetry'],
      'pipx-install-poetry-0ca5cde0d86eeb47604df03044d5d7b635821e3e70aa17922be6fde83557e29d'
    )
    expect(saveCacheMock).toHaveBeenCalledWith(
      ['PIPX_LOCAL_VENVS-FAKE-VALUE/tox'],
      'pipx-install-tox-dcee4b76e7fe46db940e29394837dff662270bcdcd7637a0afde1d55e7a93ec3'
    )
    expect(saveCacheMock).toHaveBeenCalledWith(
      ['PIPX_LOCAL_VENVS-FAKE-VALUE/poethepoet'],
      'pipx-install-poethepoet-25955029249a67aa19a06a3bb90d0419578fbbe1722abf56f3fc72c639731356'
    )
    expect(saveCacheMock).toHaveBeenCalledWith(
      ['PIPX_SHARED_LIBS-FAKE-VALUE'],
      'pipx-install-shared-4d4420c2fd7259151719e8caa3fbeafdf42c1b0c6eaca8c0edf7cfd46196ba64'
    )
  })

  it('installs using pipx (no caching)', async () => {
    await pipxInstall({
      installConfigFile: getPyprojectFile('pyproject.test1.toml'),
      cachePackages: false
    })

    expect(restoreCacheMock).not.toHaveBeenCalled()
    expect(saveCacheMock).not.toHaveBeenCalled()
  })

  it('installs using pipx (cache hit)', async () => {
    const symlinkMock = jest.spyOn(fs, 'symlink').mockImplementation()

    addCache(
      'pipx-install-shared-4d4420c2fd7259151719e8caa3fbeafdf42c1b0c6eaca8c0edf7cfd46196ba64'
    )
    addCache(
      'pipx-install-sometool-0babf7582b26404ef7d17c701f9f8707512ef2d9bae7b8f4b2596a40de8297b8',
      () => {
        addVenv('sometool')
      }
    )

    await pipxInstall({
      installConfigFile: getPyprojectFile('pyproject.test2-cache-hit.toml'),
      cachePackages: true
    })
    expect(execMock).not.toHaveBeenCalledWith('pipx', [
      'install',
      'sometool==1.2.3'
    ])
    expect(saveCacheMock).not.toHaveBeenCalled()
    expect(symlinkMock).toHaveBeenCalledWith(
      '/fake/path/to/sometool-app',
      'PIPX_BIN_DIR-FAKE-VALUE/sometool-app'
    )
  })

  it('rejects old pipx version', async () => {
    pipxVersion = '0.9.1'
    await expect(
      pipxInstall({
        installConfigFile: getPyprojectFile('pyproject.test1.toml')
      })
    ).rejects.toThrow(
      `Current Pipx version ${pipxVersion} does not meet minimum requirement`
    )
  })

  it('rejects missing package version', async () => {
    await expect(
      pipxInstall({
        installConfigFile: getPyprojectFile(
          'pyproject.test3-missing-version.toml'
        )
      })
    ).rejects.toThrow('The "version" field must be specified for package')
  })

  it('does not cache pipx shared/ if it already exists', async () => {
    const statMock = jest
      .spyOn(fs, 'stat')
      .mockImplementation(async statPath => {
        return {}
      })

    await pipxInstall({
      installConfigFile: getPyprojectFile('pyproject.test1.toml'),
      cachePackages: true
    })
    expect(restoreCacheMock).not.toHaveBeenCalledWith(
      'PIPX_SHARED_LIBS-FAKE-VALUE'
    )
    expect(saveCacheMock).not.toHaveBeenCalledWith(
      'PIPX_SHARED_LIBS-FAKE-VALUE'
    )
    expect(statMock).toHaveBeenCalledWith('PIPX_SHARED_LIBS-FAKE-VALUE')
  })
})
