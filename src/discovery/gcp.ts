import { NetworksClient, SubnetworksClient } from "@google-cloud/compute";
import { GcpSubnet, GcpVpc, GcpAccount } from "../types/new-types";
import { Console } from "console";

export async function getVpcs(account: GcpAccount): Promise<GcpVpc[]> {
	const netClient = new NetworksClient({});
	const subnetClient = new SubnetworksClient({});
	console.log("looking up GCP regions");
	const startRegions = performance.now();
	const [nets] = await netClient.list({ project: account.project });

	const regions: Set<string> = new Set();
	const vpcs: GcpVpc[] = [];
	for (const net of nets) {
		if (net.subnetworks) {
			for (const subnet of net.subnetworks) {
				const region = subnet.match(/regions\/([^/]*)/)?.pop();
				if (region != undefined) {
					regions.add(region);
				}
			}
			vpcs.push(
				GcpVpc.parse({
					type: "GcpVpc",
					id: net.id,
					projectName: account.project,
					networkName: net.name,
					subnets: [],
				}),
			);
		}
	}
	const endRegions = performance.now();
	console.log(
		`searching up all GCP regions took ${endRegions - startRegions}ms`,
	);

	const startParsing = performance.now();
	console.log("looking up subnet details");
	for (const region of regions) {
		console.log("searching for region", region);
		const res = await subnetClient.list({
			project: account.project,
			region,
		});
		for (const subnet of res[0]) {
			for (const vpc of vpcs) {
				if (vpc.networkName == subnet.network?.split("networks/")[1]) {
					vpc.subnets?.push(
						GcpSubnet.parse({
							id: subnet.id,
							cidr: subnet.ipCidrRange,
							type: "GcpSubnet",
							region,
						}),
					);
					break;
				}
			}
		}
	}
	const endParsing = performance.now();
	console.log(`looking up GCP subnets took ${endParsing - startParsing}ms`);
	return vpcs;
}

export default { getVpcs };
