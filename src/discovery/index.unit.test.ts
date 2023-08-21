import { getSubnets } from "./index";
import { CloudAccount } from "../types/new-types";

describe("discovery agent tests", () => {
	it("should fail if unsupported cloud credentials are provided", async () => {
		// TODO: this will likely need to change when we sort out long-term credentials plan (i.e. to support multiple)
		const badAccounts = [
			{
				type: "BlueAccount",
				id: "abc",
				subscriptionId: "place-holder",
			},
			{
				type: "GapAccount",
				id: "abc",
				project: "project-placeholder",
			},
			{
				type: "AmsAccount",
				id: "abc",
				region: "us-east2",
			},
		];
		// @ts-expect-error bad typing test
		const _badResult: CloudAccount[] = await expect(
			// @ts-expect-error bad typing test
			getSubnets(badAccounts),
		).rejects.toThrow();
	});
});
