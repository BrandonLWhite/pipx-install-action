<!--
TODO Docs:
- Developed and tested on Linux runners.
- Requires pipx > ? to already be installed in the runner (this is the case for Github Ubuntu runner)
- Inject
- Why pipx?
- Wait, how does pipx get install?  (It's already installed in GHA runners)
- List of tools that are candidates for installing with pipx-install:
-     Poetry, pdm, pipenv, hatch, poethepoet, invoke, tox, nox,
-->

# pipx-install GitHub Action

[![GitHub Super-Linter](https://github.com/actions/hello-world-javascript-action/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/actions/hello-world-javascript-action/actions/workflows/ci.yml/badge.svg)

This action installs Python tools using [pipx](https://github.com/pypa/pipx).

- Packages are specified in the `pyproject.toml` file.
- Installed files are cached, so that subsequent runs simply restore from the cache for the same package version.
- Pipx `inject` is supported, allowing you to also install plugins for tools that support it.

## What problem does this solve?
Tools like [Poetry](https://python-poetry.org/) and [PDM](https://github.com/pdm-project/pdm) do a great job of managing Python application dependencies, but something has to install those tools globally in the GitHub runner before they can be used.
There's also other types of tools that require or prefer a global install, such as [tox](https://tox.wiki/) and [pothepoet](https://github.com/nat-n/poethepoet).

pipx-install aims to fill that gap by providing Python developers an easy and familiar way to specify tooling prequisites needed to perform CI/CD operations on a Python project.

## Basic Usage

Here's an example of how to use this action in a workflow file:

```yaml
    steps:
      - name: Install Python Tools
        uses: BrandonLWhite/pipx-install-action
```

Tool packages are expressed in your project's pyproject.toml file `tool.pipx-install` section like this:

```toml
[tool.pipx-install]
poetry = "==1.7.1"
tox = "~=4.11.4"
```

### Version specifiers
Version specifiers are passed directly to `pipx`, so you can use anything that works with `pipx`, which should be any scheme supported by `pip`, which are defined in [PEP-440](https://peps.python.org/pep-0440/).

> [!NOTE]
> While you can, and probably should, pin/lock your CI tools to exact versions (eg `"==1.7.1"`) it is important to note that the dependencies of those tools will not be locked to exact versions.  This is because `pipx` has no concept of a lockfile at this time.  Should such functionality ever become available in `pipx``, support will be added to `pipx-install``.

## Inputs

| Input                 | Default          | Description                     |
| --------------------- | ---------------- | ------------------------------- |
| `install-config-file` | `pyproject.toml` | Path to the TOML file that specifies the [tool.pipx-install] section  |
| `cache-packages`      | `true`           | When 'true', packages will be saved to the repository's GitHub Action cache and restored whenever possible to avoid downloading from the upstream pacakge repository (eg. PyPI)  |


## Outputs

None at this time.