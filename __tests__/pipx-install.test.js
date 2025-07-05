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
    process.env.ImageVersion = '20250622.1.0'
    process.env.ImageOS = 'ubuntu24'

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
      'pipx-install-poetry-fe16d3d2c69628638a1e4cede2e1ed8b44619ad00b3dad98493652e204383c8b'
    )
    expect(saveCacheMock).toHaveBeenCalledWith(
      ['PIPX_LOCAL_VENVS-FAKE-VALUE/tox'],
      'pipx-install-tox-c53f41cc5ca935c7b3e1d3312d4bd41f9130f9e6c361b33802f40261c3d64e97'
    )
    expect(saveCacheMock).toHaveBeenCalledWith(
      ['PIPX_LOCAL_VENVS-FAKE-VALUE/poethepoet'],
      'pipx-install-poethepoet-427ca9496a47ed76de68a487e77542aa2cd93fe734a44fd9cd728bc5e56b1737'
    )
    expect(saveCacheMock).toHaveBeenCalledWith(
      ['PIPX_SHARED_LIBS-FAKE-VALUE'],
      'pipx-install-shared-bd4b048a3dc2a3c8de88799b9460bf8744c2a674ef52b677d2ecd776d05a50e7'
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
    process.env.ImageVersion = '20250623.1.0'
    process.env.ImageOS = 'win22'

    const symlinkMock = jest.spyOn(fs, 'symlink').mockImplementation()

    addCache(
      'pipx-install-shared-6338ae2714f1c71b9856ebb3020c43758486b409733e08d60eeb09a9290fdbd0'
    )
    addCache(
      'pipx-install-sometool-ed50bd8ac9ca2bb25d892d536e8b05c3c4c4244e8c1af35c31dc212d05e75870',
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
