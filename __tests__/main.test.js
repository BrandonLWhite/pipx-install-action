/**
 * Unit tests for the action's main functionality, src/main.js
 */
const path = require('path')
const fs = require('fs')
const core = require('@actions/core')
const github = require('@actions/github')
const yaml = require('js-yaml')
const main = require('../src/main')

// Mock the GitHub Actions core library
const infoMock = jest.spyOn(core, 'info').mockImplementation()
const getInputMock = jest.spyOn(core, 'getInput').mockImplementation()
const setFailedMock = jest.spyOn(core, 'setFailed').mockImplementation()
const setOutputMock = jest.spyOn(core, 'setOutput').mockImplementation()

// Mock the action's main function
const runMock = jest.spyOn(main, 'run')

const testDataDir = path.join(__dirname, 'data')
const emptyPyprojectFile = path.join(testDataDir, 'pyproject.empty.toml')

const actionYmlFile = path.join(__dirname, '..', 'action.yml')

describe('action', () => {
  const inputsDefaults = {}
  const actionYml = yaml.load(fs.readFileSync(actionYmlFile))
  for (const [inputName, inputConfig] of Object.entries(actionYml.inputs)) {
    inputsDefaults[inputName] = inputConfig.default
  }

  let inputs = null

  beforeEach(() => {
    jest.clearAllMocks()
    inputs = {
      ...inputsDefaults,
      'install-config-file': emptyPyprojectFile
    }

    // Mock the action's inputs
    getInputMock.mockImplementation((name) => {
      return inputs[name]
    })
  })

  it('logs if nothing to do', async () => {
    // Mock the action's payload
    github.context.payload = {
      actor: 'mona'
    }

    await main.run()

    expect(runMock).toHaveReturned()
    expect(infoMock).toHaveBeenCalledWith('Nothing to install.')
  })

  it('sets a failed status', async () => {
    inputs['install-config-file'] = 'failfail.fail'

    // Mock the action's payload
    github.context.payload = {
      actor: 'mona'
    }

    await main.run()

    expect(runMock).toHaveReturned()
    expect(setFailedMock).toHaveBeenCalledWith(
      "ENOENT: no such file or directory, open 'failfail.fail'"
    )
  })
})
