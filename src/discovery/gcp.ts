import { NetworksClient, SubnetworksClient } from "@google-cloud/compute";
import { GcpSubnet, GcpVpc, GcpAccount } from "../types/new-types";

export async function getVpcs(account: GcpAccount): Promise<GcpVpc[]> {
	const netClient = new NetworksClient({});
	const subnetClient = new SubnetworksClient({});

	const [nets] = await netClient.list({ project: account.project });

	const vpcs: GcpVpc[] = [];
	// This is pretty slow right now, need to find something in between full async (rate limited) and sequential
	for (const net of nets) {
		if (net.subnetworks) {
			const subnets: GcpSubnet[] = [];
			for (const subnet of net.subnetworks) {
				const region = subnet.match(/regions\/([^/]*)/)?.pop();
				const [subnetDetail] = await subnetClient.get({
					project: account.project,
					subnetwork: subnet.split("/subnetworks/")[1],
					region,
				});
				subnets.push(
					GcpSubnet.parse({
						id: subnetDetail.id,
						cidr: subnetDetail.ipCidrRange,
						type: "GcpSubnet",
						region,
					}),
				);
			}
			vpcs.push(
				GcpVpc.parse({
					type: "GcpVpc",
					id: net.id,
					projectName: account.project,
					networkName: net.name,
					subnets,
				}),
			);
		}
	}

	return vpcs;
}

export default { getVpcs };
