# Installing and Configuring Cloud CLIs

Chasm uses the cloud credentials from the CLIs installed on the host machine to authenticate with the CSPs. Install the CLI for each CSP that you want involved in your meshed network, and authenticate that CLI so that it can work within your cloud environment.

## Azure

1. Install by following the [Azure CLI install tutorial](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
   - Windows users should [install for linux](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli-linux?pivots=apt) in their WSL distribution.
2. Login with

    ```sh
    az login
    ```

3. If your `az` CLI is logged into multiple Azure Subscriptions, Chasm will use the one currently set to be active.  You can change that like so:

    ```sh
    az account set --subscription subscription-id-you-want-active
    ```

## Google Cloud Platform

1. Install by following the [gcloud CLI install tutorial](https://cloud.google.com/sdk/docs/install#linux)
    - *Windows users should install for their linux distro in WSL.*
2. Login with

    ```sh
    gcloud auth login
    ```

3. Create application default credentials

    ```sh
    gcloud auth application-default login
    ```

## AWS

1. Install [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
    - *Windows users should install for their linux distro in WSL.*

2. Login with [short-term credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-authentication-short-term.html)
    - Chasm uses default credentials, meaning your `~/.aws/credentials` file should have you credentials under [default], like so:

        ```sh
        [default]
        aws_access_key_id = AKIAIOSFODNN7EXAMPLE
        aws_secret_access_key = afasefjwqg/K7MDENG/bPxRfiCYEXAMPLEKEY
        aws_session_token = IQoJb3JpZ2luX2IQoJb3JpZ2luX2IQoJb3JpZ2luX2IQoJb3JpZ2luX2IQoJb3JpZVERYLONGSTRINGEXAMPLE
        ```
