const path = require('path')

const actionsCache = require('@actions/cache')
const actionsExec = require('@actions/exec')
const core = require('@actions/core')

// Mock the GitHub Actions core library
const infoMock = jest.spyOn(core, 'info').mockImplementation()

const saveCacheMock = jest.spyOn(actionsCache, 'saveCache').mockImplementation()
const restoreCacheMock = jest.spyOn(actionsCache, 'restoreCache').mockImplementation()

const execMock = jest.spyOn(actionsExec, 'exec').mockImplementation()
const getExecOutputMock = jest.spyOn(actionsExec, 'getExecOutput').mockImplementation()

// const setFailedMock = jest.spyOn(core, 'setFailed').mockImplementation()
// const setOutputMock = jest.spyOn(core, 'setOutput').mockImplementation()

const testDataDir = path.join(__dirname, 'data')
const test1PyprojectFile = path.join(testDataDir, 'pyproject.test1.toml')
const packageSpecRegExp = new RegExp("(\\w+)(~=|===|==|!=|<=|>=|<|>)?")

describe('pipx-install', () => {
  const { pipxInstall } = require('../src/pipx-install')

  beforeEach(() => {
    jest.clearAllMocks()

    const venvs = {}

    async function mockExec(command, args) {
      let stdout = null
      if (command == 'pipx') {
        pipxCommand = args[0]
        if (pipxCommand == '--version') {
          stdout = '1.1.1'
        }
        else if (pipxCommand == 'environment') {
          stdout = `${args[2]}-FAKE-VALUE`
        }
        else if (pipxCommand == 'install') {
          const packageSpec = args[1]
          const matchResult = packageSpec.match(packageSpecRegExp)
          const packageName = matchResult[1]
          venvs[packageName] = {
            metadata: {
              python_version: 'Python 3.11.5',
              main_package: {
                apps: [`${packageName}-app`]
              }
            }
          }
        }
        else if (pipxCommand == 'list') {
          stdout = JSON.stringify({venvs})
        }
      }
      else if (command == 'python') {
        if (args[0] == '--version') {
          stdout = 'Python 3.11.5'
        }
      }

      return { stdout }
    }

    getExecOutputMock.mockImplementation(mockExec)
    execMock.mockImplementation(mockExec)
  })

  it('installs using pipx', async () => {

    await pipxInstall({ installConfigFile: test1PyprojectFile, cachePackages: true })

    //   expect(runMock).toHaveReturned()
    //   expect(infoMock).toHaveBeenCalledWith(
    //     `The event payload: ${JSON.stringify(github.context.payload, null, 2)}`
    //   )
  })
})