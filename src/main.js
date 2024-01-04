const core = require('@actions/core')
const github = require('@actions/github')
const { pipxInstall } = require('./pipx-install')

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  try {
    const configFile = core.getInput('config-file') //  TODO BW: Default this to simply `pyproject.toml`

    await pipxInstall(configFile)

    // Output the payload for debugging
    core.info(
      `The event payload: ${JSON.stringify(github.context.payload, null, 2)}`
    )
  } catch (error) {
    // Fail the workflow step if an error occurs
    core.setFailed(error.message)
  }
}

module.exports = {
  run
}
