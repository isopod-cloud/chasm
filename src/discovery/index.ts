import AWS from "./aws";
import Azure from "./azure";
import GCP from "./gcp";
import { CloudAccount } from "../types/new-types";

export async function getSubnets(
	accounts: CloudAccount[],
): Promise<CloudAccount[]> {
	for (const account of accounts) {
		switch (account.type) {
			case "AwsAccount": {
				// const start = performance.now()
				// account.vpcs = await AWS.getVpcs(account);
				// const end = performance.now()
				// console.log(`Call to scrape ${account.vpcs.length} AWS VPCs took ${end - start} milliseconds`)
				break;
			}
			case "AzureAccount": {
				// account.vpcs = await Azure.getVpcs(account);
				break;
			}
			case "GcpAccount": {
				const start = performance.now();
				account.vpcs = await GCP.getVpcs(account);
				const end = performance.now();
				console.log(
					`Call to scrape ${account.vpcs.length} GCP VPCs took ${
						end - start
					} milliseconds`,
				);
				break;
			}
			default: {
				void (account satisfies never); // Using account.type gives error?
				return Promise.reject(new TypeError("Unsupported input type"));
			}
		}
	}
	return accounts;
}
