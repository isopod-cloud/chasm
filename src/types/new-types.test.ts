import {
	abstractSubspaceGenerator,
	azureVpcGenerator,
	AzureVpcSpecGenerator,
	ProtoConfigGenerator,
	splitCidr,
	uniqueNamespace,
} from "./new-types";
import * as fs from "fs";

describe("potato", () => {
	it("should computer", () => {
		const numberOfVpcs = 8;
		const numberOfSubnets = 4;
		const specs = AzureVpcSpecGenerator({
			cidr: "10.0.0.0/16",
			namespace: uniqueNamespace(),
			numberOfSubnets,
			numberOfVpcs,
		});
		expect(specs).toHaveLength(numberOfVpcs);
		// expect(specs).toBe(18);
		console.log(JSON.stringify(specs, null, 2));
	});

	it("should do more complex things", () => {
		const vpcSpecs = ProtoConfigGenerator({
			cidr: "10.0.0.0/8",
			namespace: uniqueNamespace(),
			azure: {
				numberOfSubnets: 4,
				numberOfVpcs: 2,
			},
			aws: {
				numberOfSubnets: 2,
				numberOfVpcs: 5,
			},
			gcp: {
				numberOfSubnets: 4,
				numberOfVpcs: 2,
			},
		});

		const stringifyed = JSON.stringify(vpcSpecs, null, 2);
		fs.writeFileSync("./src/types/new-types.test2.json", stringifyed, "utf-8");
	});
});
