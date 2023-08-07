import { getSubnets } from "./index";
import { CloudAccount } from "../types/new-types";
import { readFromConfigFile } from "../utils";


describe("discovery agent tests", () => {
    it("should get subnets from all cloud accounts", async () => {
        // TODO: this will likely need to change when we sort out long-term credentials plan (i.e. to support multiple)
        const accounts: CloudAccount[] = (await readFromConfigFile("./config.json")).accounts;
		const results: CloudAccount[] = await getSubnets(accounts);
        // ?
        for(const result of results) {
            expect(result.vpcs).toBeDefined();
        }
	});
    it("should fail if unsupported cloud credentials are provided", async () => {
        // TODO: this will likely need to change when we sort out long-term credentials plan (i.e. to support multiple)
        const badAccounts =
        [
            {
                "type": "BlueAccount",
                "id": "abc",
                "subscriptionId": "place-holder",
            },
            {
                "type": "GapAccount",
                "id": "abc",
                "project": "project-placeholder",
            },
            {
                "type": "AmsAccount",
                "id": "abc",
                "region": "us-east2",
            }
        ];
        // @ts-expect-error bad typing test
        const _badResult: CloudAccount[] = await expect(getSubnets(badAccounts)).rejects.toThrow();
    })
});
