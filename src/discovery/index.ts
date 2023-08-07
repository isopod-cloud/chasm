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
				account.vpcs = await AWS.getVpcs(account);
				break;
			}
			case "AzureAccount": {
				account.vpcs = await Azure.getVpcs(account);
				break;
			}
			case "GcpAccount": {
				account.vpcs = await GCP.getVpcs(account);
				break;
			}
			default: {
				void (account satisfies never) // Using account.type gives error?
				return Promise.reject(new TypeError("Unsupported input type"));
			}
		}
	}
	return accounts;
}
