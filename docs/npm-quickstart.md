# NPM Quickstart

## Prerequisites

Must have `node` and `npm` installed. [Follow guide here](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm), and check the installed versions with:

```sh
node -v
npm -v
```

Must have `pulumi` installed. Note the version in [package.json](../package.json), and **install the exact same version**, following the guide for [Installing Betas and Previous Versions](https://www.pulumi.com/docs/install/#installing-betas-and-previous-versions)

```sh
    "resolutions": {
        "@pulumi/pulumi": "x.x.x"
    }
```

Check version installed, it must match exactly with what is in [package.json](../package.json)

```sh
pulumi version
```

Install the `chasm` npm package with:

```sh
npm install @isopod/chasm
```


### Installing and configuring cloud CLIs

Before proceeding, follow [the guide for installing and configuring cloud CLIs](docs/installing-cloud-clis.md).

## Usage

**Windows users MUST follow these steps from a WSL2 terminal in the distribution they run Docker from. [Link to install WSL](https://learn.microsoft.com/en-us/windows/wsl/install)**

Quick overview of what will be done in the quickstart (more in depth instruction in the following section):

1. In `./mount/config.json`, define the Cloud Accounts that will be used to look up Subnets
2. Run the `find` command to list all the subnets that can be meshed
3. In `./mount/config.json`, edit the list of discovered subnets until it contains only the subnets you want to mesh
4. Run the `mesh` command to mesh those subnets

### Initializing a project directory

First, make a project directory, a mount folder, and change directories into the project folder

```sh
mkdir -p chasm/mount/
cd chasm
```

### Config file

The config file determines:

1. Which clouds are scraped for subnets (from the "accounts" field)
2. Which subnets are meshed together (from the "subnets" field within the "VPCs" field for each "account")
    - We do not need to specify "VPCs" in order to run the scrape functionality. It is only used for meshing.

Copy the example config file into `./mount/config.json`.

```sh
cat << EOF > ./mount/config.json
{
    "accounts": [
        {
            "type": "AwsAccount",
            "id": "arbitrary-unique-id-aws1",
            "region": "YOUR_AWS_REGION"
        },
        {
            "type": "GcpAccount",
            "id": "arbitrary-unique-id-gcp1",
            "project": "YOUR_GCP_PROJECT"
        },
        {
            "type": "AzureAccount",
            "id": "arbitrary-unique-id-az1",
            "subscriptionId": "YOUR_AZURE_SUBSCRIPTION_ID"
        }
    ]
}
EOF
```

### Discovering all VPCs and subnets

1. Modify `./mount/config.json` so that only the cloud accounts you want to scrape are in the "accounts" field

2. Modify `./mount/config.json` so that:

   - For AWS accounts
     - Set the region field to a region from [this aws regions list](https://www.cloudregions.io/aws/regions)
   - For GCP accounts
     - Set the project field to a PROJECT_ID. You can list them by running:`gcloud projects list`
   - For Azure accounts
     - Set the subscriptionId field toA subscriptionId. You can list them by running `az account subscription list`

3. Scrape all the subnets in the clouds you are logged into with (note this can take a few minutes):

```sh
chasm find
```

_Note_: the az cli breaks without read write access to the credential directory.

This will output a `json` description of all discovered VPCs and subnets to standard out, as well as to a file in `./mount/discovered.json`.

### Meshing subnets

1. Copy **_only_** the VPCs and subnets to be added to the mesh network from the output, into the VPCs section it's account in `./mount/config.json`. For example, a complete GCP account with VPCs would look like:

```json
{
    "type": "GcpAccount",
    "id": "arbitrary-unique-id",
    "project": "get from 'gcloud projects list'",
    "vpcs": [
        {
            "id": "xxxxxxxxxxxxxxxxxx",
            "type": "GcpVpc",
            "projectName": "myProject",
            "networkName": "xxxxxxxxxxxxxxxxxx-vpc",
            "subnets": [
                {
                    "id": "xxxxxxxxxxxxxxxxxx",
                    "cidr": "xxx.xxx.xxx.xxx/xx",
                    "type": "GcpSubnet",
                    "region": "us-west4"
                }
            ]
        }
    ]
}
```

[The pre-mesh config file](https://gitlab.com/isopod-cloud/chasm/-/blob/main/examples/config.pre-mesh-example.json) is a more complete example.

#### Standing up a mesh network

First, export and arbitrary `PULUMI_CONFIG_PASSPHRASE`:

```sh
export PULUMI_CONFIG_PASSPHRASE="arbitrary-passphrase"
```

Create the mesh network with:

_Be aware that this will create cloud resources which cost money. Make sure you preserve the `./mount/stackWorkDir`_ directory for when you want to tear down in the next step.\*

```sh
chasm mesh --name "my-network" --url file:///app/mount/stack
```

When prompted, enter a pre shared key (PSK). It should be atleast 8 characters. PSKs used during the IKEv2 (Internet Key Exchange) to secure traffic between the two peers while they work on generating random keys to use to talk to each other. [More about pre shared keys here](https://en.wikipedia.org/wiki/Pre-shared_key)

### Tearing down a mesh network

Chasm also allows you to tear-down the network you created. This gives you the flexibility to automate bringing up and tearing down the network on demand.

It is important to note that there may be some delay between when the CSPs in delete the network resources, and when the network fully come down. We recommend allowing about 5 minutes buffer time between when you need the network to be up and running if you plan to bring it up shortly after tearing it down.

1. Destroy the mesh network with:

```sh
chasm mesh --name "my-network" -D --url file:///app/mount/stack
```

### Troubleshooting

Check out our [troubleshooting page](../TROUBLESHOOTING.md)
