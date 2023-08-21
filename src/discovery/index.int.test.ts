import { getSubnets } from "./index";
import { CloudAccount } from "../types/new-types";
import { readFromConfigFile } from "../utils";

describe("discovery agent tests", () => {
	it("should get subnets from all cloud accounts", async () => {
		// TODO: this will likely need to change when we sort out long-term credentials plan (i.e. to support multiple)
		const accounts: CloudAccount[] = (await readFromConfigFile("./config.json"))
			.accounts;
		const results: CloudAccount[] = await getSubnets(accounts);
		// ?
		for (const result of results) {
			expect(result.vpcs).toBeDefined();
		}
	}, 300000); // Large timeout cause GCP can be very, very slow
});
