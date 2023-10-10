import {
	NetworksClient,
	SubnetworksClient,
	RegionsClient,
} from "@google-cloud/compute";
import { GcpSubnet, GcpVpc, GcpAccount } from "../types/new-types";

export async function getVpcs(account: GcpAccount): Promise<GcpVpc[]> {
	const netClient = new NetworksClient({});
	const subnetClient = new SubnetworksClient({});
	console.log("parsing regions");
	const startRegions = performance.now();
	const [nets] = await netClient.list({ project: account.project });

	const vpcs: GcpVpc[] = [];

	// console.log(subnetDetail.length)
	// This is pretty slow right now, need to find something in between full async (rate limited) and sequential
	const regions: Set<string> = new Set();
	for (const net of nets) {
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
			// vpcs.push(
			// 	GcpVpc.parse({
			// 		type: "GcpVpc",
			// 		id: net.id,
			// 		projectName: account.project,
			// 		networkName: net.name,
			// 		subnets,
			// 	}),
			// );
		}
	}
	const endRegions = performance.now();
	console.log(`searching up all regions took ${endRegions - startRegions}ms`);

	const startParsing = performance.now();
	console.log("parsing subnets");
	// for (const net of nets) {
	for (const region of regions) {
		const start = performance.now();
		console.log("searching for region", region);
		const res = await subnetClient.list({
			project: account.project,
			// filter: `network = ${net}`
			region,
		});
		const end = performance.now();
		console.log(`lookup took ${end - start}ms`);
		for (const subnet of res[0]) {
			console.log(subnet.name, subnet.network);
		}
	}
	const endParsing = performance.now();
	console.log(`parsing all subnets took ${endParsing - startParsing}ms`);
	return vpcs;
}

export default { getVpcs };
