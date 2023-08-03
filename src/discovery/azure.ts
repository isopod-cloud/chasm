import { ResourceManagementClient } from "@azure/arm-resources";
import { DefaultAzureCredential } from "@azure/identity";
import { NetworkManagementClient } from "@azure/arm-network";
import { AzureVpc, AzureSubnet, AzureAccount } from "../types/new-types";

export async function getVpcs(account: AzureAccount): Promise<AzureVpc[]> {
	// Here we call Azure's vnet a vpc. This is inaccurate but allows for consistency between clouds/
	const creds = new DefaultAzureCredential();
	const rgClient = new ResourceManagementClient(creds, account.subscriptionId);
	const subnetClient = new NetworkManagementClient(
		creds,
		account.subscriptionId,
	);
	const vpcs: AzureVpc[] = [];

	for await (const rg of rgClient.resourceGroups.list()) {
		for await (const vnet of subnetClient.virtualNetworks.list(rg.name!)) {
			const subnets: AzureSubnet[] = [];
			for await (const subnet of subnetClient.subnets.list(
				rg.name!,
				vnet.name!,
			)) {
				subnets.push(
					AzureSubnet.parse({
						id: subnet.id,
						cidr: subnet.addressPrefix,
						type: "AzureSubnet",
					}),
				);
			}
			vpcs.push(
				AzureVpc.parse({
					id: vnet.id,
					type: "AzureVpc",
					region: vnet.location,
					resourceGroupName: rg.id,
					subnets,
				}),
			);
		}
	}
	return vpcs;
}

export default { getVpcs };
