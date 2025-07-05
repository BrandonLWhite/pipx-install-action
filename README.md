# [pipx-install GitHub Action](https://github.com/brandonlwhite/pipx-install-action)

[![GitHub Super-Linter](https://github.com/brandonlwhite/pipx-install-action/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/brandonlwhite/pipx-install-action/actions/workflows/ci.yml/badge.svg)
![Test Converage](https://raw.githubusercontent.com/BrandonLWhite/pipx-install-action/main/badges/coverage.svg)

This action installs Python tools using [pipx](https://github.com/pypa/pipx).

- Packages are specified in the `pyproject.toml` file.
- Installed files are cached, so that subsequent runs simply restore from the
  cache for the same package version.
- Pipx `inject` is supported, allowing you to also install plugins for tools
  that support it.

## What problem does this solve?

Tools like [Poetry](https://python-poetry.org/) and
[PDM](https://github.com/pdm-project/pdm) do a great job of managing Python
application dependencies, but something has to install those tools globally in
the GitHub runner before they can be used. There's also other types of tools
that require or prefer a global install, such as [tox](https://tox.wiki/) and
[pothepoet](https://github.com/nat-n/poethepoet).

`pipx-install` aims to fill that gap by providing Python developers an easy and
familiar way to specify tooling prerequisites needed to perform CI/CD operations
on a Python project.

## Basic Usage

Here's an example of how to use this action in a workflow file:

```yaml
steps:
  - name: Install Python Tools
    uses: BrandonLWhite/pipx-install-action
```

Tool packages are expressed in your project's `pyproject.toml` file
`[tool.pipx-install]` section like this:

```toml
[tool.pipx-install]
poetry = "==1.7.1"
tox = "~=4.11.4"
```

### Version specifiers

Version specifiers are passed directly to `pipx`, so you can use anything that
works with `pipx`, which should be any scheme supported by `pip`, which are
defined in [PEP-440](https://peps.python.org/pep-0440/).

> [!NOTE] While you can, and probably should, pin/lock your CI tools to exact
> versions (eg `"==1.7.1"`) it is important to note that the dependencies of
> those tools will not be locked to exact versions. This is because `pipx` has
> no concept of a lockfile at this time. Should such functionality ever become
> available in `pipx`, support will be added to `pipx-install`.

## Installing plugins via `inject`

Some tools support adding third-party plugins by installing them into the same
virtual environment as the parent tool. `pipx` supports this through its
`inject` operation and `pipx-install` allows you to specify any number of
plugins to inject for a tool. Here is an example of the pyproject.toml
`[tool.pipx-install]` syntax for adding plugins:

```toml
poetry = {version = "==1.7.1", inject = {poetry-plugin-bundle = "==1.3.0", poetry-plugin-export = "==1.6.0"} }
```

This example would install `poetry` at version 1.7.1 and then inject 2 plugins:
`poetry-plugin-bundle` version 1.3.0 and `poetry-plugin-export` version 1.6.0.

## About pipx

`pipx` is the de facto Python tool to globally install CLI applications in
isolated virtual environments. The minimum required version is `1.1.0` for use
with `pipx-install`. Fortunately, `pipx` is already installed in the standard
GitHub hosted runners!

> [!NOTE] `pipx-install` is only tested on Ubuntu Linux and Windows based
> runners at this time. "It should work" on MacOS runners, but if you encounter
> an issue please file a bug report with all the details!

## Python command-line (CLI) tools that are good candidates for installing with pipx-install

Here's a list of tools that are examples of what `pipx-install` is built to
handle. (This list is mostly here to help folks searching for a solution to get
their tool installed in their GHA workflow):

- [poetry](https://github.com/python-poetry/poetry)
- [pdm](https://github.com/pdm-project/pdm)
- [pipenv](https://pipenv.pypa.io)
- [hatch](https://github.com/pypa/hatch)
- [tox](https://tox.wiki)
- [poethepoet](https://github.com/nat-n/poethepoet)
- [invoke](https://github.com/pyinvoke/invoke)
- [nox](https://github.com/wntrblm/nox)

## Inputs

| Input                 | Default          | Description                                                                                                                                                                     |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `install-config-file` | `pyproject.toml` | Path to the TOML file that specifies the `[tool.pipx-install]` section                                                                                                          |
| `cache-packages`      | `true`           | When 'true', packages will be saved to the repository's GitHub Action cache and restored whenever possible to avoid downloading from the upstream package repository (eg. PyPI) |

## Outputs

None at this time.
