import { NetworksClient, SubnetworksClient } from "@google-cloud/compute";
import { GcpSubnet, GcpVpc, GcpAccount } from "../types/new-types";
import { Console } from "console";

export async function getVpcs(account: GcpAccount): Promise<GcpVpc[]> {
	const netClient = new NetworksClient({});
	const subnetClient = new SubnetworksClient({});
	console.log("parsing regions");
	const startRegions = performance.now();
	const [nets] = await netClient.list({ project: account.project });

	// This is pretty slow right now, need to find something in between full async (rate limited) and sequential
	const regions: Set<string> = new Set();
	const vpcs: GcpVpc[] = [];
	for (const net of nets) {
		console.log(net.id, net.name);
		if (net.subnetworks) {
			const subnets: GcpSubnet[] = [];
			for (const subnet of net.subnetworks) {
				const region = subnet.match(/regions\/([^/]*)/)?.pop();
				// const [subnetDetail] = await subnetClient.list({
				// 	project: account.project,
				// 	// subnetwork: subnet.split("/subnetworks/")[1],
				// 	region,
				// });
				if (region != undefined) {
					regions.add(region);
				}
				// subnetDetail.map(x => x.)
				// subnets.push(
				// 	GcpSubnet.parse({
				// 		id: subnetDetail.id,
				// 		cidr: subnetDetail.ipCidrRange,
				// 		type: "GcpSubnet",
				// 		region,
				// 	}),
				// );
			}
			// console.log(net.subnetworks)
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
	console.log(`searching up all regions took ${endRegions - startRegions}ms`);

	const startParsing = performance.now();
	console.log("parsing subnets");
	// const netNameToSubnets : Record<string, GcpSubnet[]>;
	const subnets: GcpSubnet[] = [];
	for (const region of regions) {
		console.log("searching for region", region);
		const res = await subnetClient.list({
			project: account.project,
			// filter: `network = ${net}`
			region,
		});
		for (const subnet of res[0]) {
			for (const vpc of vpcs) {
				// console.log("checking", vpc.networkName, subnet.network?.split('/networks/')[1])
				if (vpc.networkName == subnet.network?.split("networks/")[1]) {
					// console.log("match", vpc.networkName, subnet.network);
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
	console.log(`parsing all subnets took ${endParsing - startParsing}ms`);
	return vpcs;
}

export default { getVpcs };
