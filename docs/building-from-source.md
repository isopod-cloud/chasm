# Building from source

This is only recommended for contributing developers.

## Prerequisites

Ensure [yarn](https://classic.yarnpkg.com/lang/en/docs/install/) is installed. Follow the [guide here](https://classic.yarnpkg.com/lang/en/docs/install/).

## Guide

Clone this repository

```sh
git clone git@gitlab.com:isopod-cloud/chasm.git
cd chasm
```

Install dependencies (this should be done whenever the dependencies change)

```sh
yarn install
```

Build the project (this should be done anytime the source code is changed)

```sh
yarn build
```

Run command line program

```sh
yarn start
```

Expected output:

```text
Usage: chasm <OPTION...>

CLI for managing your cloud networks

1. Install the cloud CLI
2. Login to cloud CLI

Commands:
  find [options]  find all the subnets in the currently logged in accounts.
  mesh [options]  meshes together all the subnets given in the config file.
  help [command]  display help for command
```

You can run `npm link` after building to enable you to use `chasm` commands:

```sh
yarn build && yarn link
```

Then,

```sh
chasm mesh
```

You may also find the [npm quickstart](./npm-quickstart.md) useful for more examples.

Or, build the docker image with:

```sh
yarn build && docker build . --tag chasm
```

and look at examples on the [README.md](../README.md) for usages.