import { getVpcs } from "./azure";
import { AzureVpc, AzureSubnet, AzureAccount } from "../types/new-types";
import { ResourceManagementClient } from "@azure/arm-resources";
import { DefaultAzureCredential } from "@azure/identity";
import { NetworkManagementClient, VirtualNetwork } from "@azure/arm-network";
import { getAccountConfigForTest } from "../utils";


// Azure Helper functions
async function createAzureTestFixturesDA(
	rgClient: ResourceManagementClient,
	subnetClient: NetworkManagementClient,
	numSubnets: number,
	location?: string,
): Promise<void> {
	const groupName = "test-rg";
	const virtualNetworkName = "test-net";
	const groupParameters = {
		location: location ? location : "eastus2",
		tags: {
			test: "true",
		},
	};

	await rgClient.resourceGroups.createOrUpdate(groupName, groupParameters);
	const add_prefixes = [];

	for (let i = 0; i < numSubnets; ++i) {
		add_prefixes.push(`10.${i}.0.0/16`);
	}

	const parameter: VirtualNetwork = {
		addressSpace: {
			addressPrefixes: add_prefixes,
		},
		location: location ? location : "eastus2",
	};
	await subnetClient.virtualNetworks
		.beginCreateOrUpdateAndWait(groupName, virtualNetworkName, parameter)
		.then((res) => {
			console.log(res);
		});

	for (let i = 0; i < numSubnets; ++i) {
		await subnetClient.subnets
			.beginCreateOrUpdateAndWait(
				groupName,
				virtualNetworkName,
				`test-subnet-${i}`,
				{
					addressPrefix: `10.${i}.0.0/24`,
				},
			)
			.then((res) => {
				console.log(res);
			});
	}

};

async function destroyAzureTestFixturesDA(
	rgClient: ResourceManagementClient,
	groupName: string,
): Promise<void> {
	await rgClient.resourceGroups.beginDeleteAndWait(groupName);
};

describe("discovery agent tests for azure", () => {
	const numSubnets = 3;
	const azureAccount = getAccountConfigForTest("./config.json", "AzureAccount") as AzureAccount; // If this function didn't error, this has to be an AzureAccount
	const subId = azureAccount.subscriptionId;
	const creds = new DefaultAzureCredential();
	const rgClient = new ResourceManagementClient(creds, subId);
	const subnetClient = new NetworkManagementClient(creds, subId);
	beforeAll(async () => {
		await createAzureTestFixturesDA(
			rgClient,
			subnetClient,
			numSubnets,
			"eastus2",
		);
	});
	afterAll(async () => {
		await destroyAzureTestFixturesDA(rgClient, "test-rg");
	});
	it("should get test vpc and associated subnets from azure account(s)", async () => {
		if (!subId) {
			throw new Error("must provide subscription id");
		}
		const result: AzureVpc[] = await getVpcs(azureAccount);
		let testSubnets: AzureSubnet[] | undefined = undefined;

		for (const res of result) {
			if (res.resourceGroupName === `/subscriptions/${subId}/resourceGroups/test-rg`) {
				testSubnets = res.subnets;
			}
		}

		expect(result).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: `/subscriptions/${subId}/resourceGroups/test-rg/providers/Microsoft.Network/virtualNetworks/test-net`,
					type: "AzureVpc",
					region: "eastus2",
					resourceGroupName: `/subscriptions/${subId}/resourceGroups/test-rg`,
				}),
			]),
		);

		for (let i = 0; i < numSubnets; ++i) {
			expect(testSubnets).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: "AzureSubnet",
						cidr: `10.${i}.0.0/24`,
					}),
				]),
			);
		}

		expect(testSubnets).toHaveLength(numSubnets);
	});
});
