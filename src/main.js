const core = require('@actions/core')
const github = require('@actions/github')
const { pipxInstall } = require('./pipx-install')

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  try {
    const installConfigFile = core.getInput('install-config-file')
    const cachePackages = core.getInput('cache-packages')

    await pipxInstall({ installConfigFile, cachePackages })
  } catch (error) {
    // Fail the workflow step if an error occurs
    core.setFailed(error.message)
  }
}

module.exports = {
  run
}
