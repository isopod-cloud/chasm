import { getVpcs } from "./gcp";
import { GcpSubnet, GcpVpc, GcpAccount } from "../types/new-types";
import { getAccountConfigForTest } from "../utils";
import { NetworksClient, SubnetworksClient } from "@google-cloud/compute";
import { sleep } from "../utils";
import crypto from "crypto";
import { z } from "zod";
import { project } from "@pulumi/gcp/config";

// GCP is apparently very, very slow
const timeOut = 300000 // Timeout for try until done is 300seconds, so this is converted to ms
// GCP Helper functions, likely gonna be replaced by some sort of fixturizer
const insertResponseSchema = z.object({
	latestResponse: z.object({
		status: z.enum(["PENDING", "RUNNING", "DONE"]),
	}),
});

// The google-cloud library has a bug where latestResponse is marked as a LROperation object
// but the actual returned structure is just the raw HTTP response body. This is why
// // the returned type is unknown[] (reported as type
// [LROperation<protos.google.cloud.compute.v1.IOperation, null>,
// protos.google.cloud.compute.v1.IOperation | undefined,
// {} | undefined
// ] ). We have reported the bug in issue 293281649.
const tryUntilDone = async <U>(
	doerFunction: (p: U) => Promise<unknown[]>,
	doerArgument: U,
	timeout: number,
): Promise<unknown> => {
	let count = timeout;

	// TODO:
	// try block is due to deletion of resource occcurring before status change to "DONE" registers
	// (throws a resource not found error)
	try {
		while (count > 0) {
			const result = await doerFunction(doerArgument);

			const output = insertResponseSchema.parse(result[0]);
			if (output.latestResponse.status === "DONE") {
				return output;
			}
			await sleep(1);
			count--;
		}
	} catch (err) {
		console.log(err);
	}
};

async function buildGcpTestFixturesDA(
	subnetClient: SubnetworksClient,
	netClient: NetworksClient,
	gcpAccount: GcpAccount,
): Promise<void> {
	console.log("Starting network insert...");
	const reqId: string = crypto.randomUUID();
	const project = gcpAccount.project;
	const netReq = {
		requestId: reqId,
		project: project,
		networkResource: {
			name: "test-network-osp",
			autoCreateSubnetworks: false,
		},
	};

	const subId: string = crypto.randomUUID();
	const subReq = {
		requestId: subId,
		project: gcpAccount.project,
		region: "us-central1",
		subnetworkResource: {
			ipCidrRange: "10.77.5.0/24",
			name: "test-subnet-osp",
			network: `projects/${project}/global/networks/test-network-osp`,
		},
	};

	const _network = await tryUntilDone(
		netClient.insert.bind(netClient),
		netReq,
		300,
	);

	const _subnet = await tryUntilDone(
		subnetClient.insert.bind(subnetClient),
		subReq,
		300,
	);
};

async function destroyGcpTestFixturesDA(
	subnetClient: SubnetworksClient,
	netClient: NetworksClient,
	gcpAccount: GcpAccount,
): Promise<void> {

	const project = gcpAccount.project;
	const region = "us-central1";

	const reqIdDelete: string = crypto.randomUUID();

	const netInput = {
		network: "test-network-osp",
		project: project,
		requestId: reqIdDelete,
	};

	const subReqIdDelete: string = crypto.randomUUID();

	const subnetInput = {
		project: project,
		region: region,
		subnetwork: "test-subnet-osp",
		requestId: subReqIdDelete,
	};

	const _s = await tryUntilDone(
		subnetClient.delete.bind(subnetClient),
		subnetInput,
		300,
	).then((_res) => {
	});

	const _n = await tryUntilDone(
		netClient.delete.bind(netClient),
		netInput,
		300,
	).then((_res) => {
	});
};

describe("discovery agent tests for gcp", () => {
	const netClient = new NetworksClient({});
	const subnetClient = new SubnetworksClient({});
	const gcpAccount = getAccountConfigForTest("./config.json", "GcpAccount") as GcpAccount; // If this function didn't error, this has to be an GcpAccount
	beforeAll(async () => {
		await buildGcpTestFixturesDA(
			subnetClient,
			netClient,
			gcpAccount
		);
	}, timeOut);
	afterAll(async () => {
		await destroyGcpTestFixturesDA(
			subnetClient,
			netClient,
			gcpAccount,
		);
	}, timeOut);
	it("should get test subnets from gcp account(s)", async () => {
		const result: GcpVpc[] = await getVpcs(gcpAccount);

		console.log(result.length);

		let testSubnets: GcpSubnet[] | undefined = undefined;

		const testVpcs: GcpVpc[] = [];

		for (const res of result) {
			if (res.networkName === "test-network-osp") {
				testVpcs.push(res);
				testSubnets = res.subnets;
			}
		}

		expect(result).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "GcpVpc",
					projectName: gcpAccount.project,
					networkName: "test-network-osp",
				}),
			]),
		);

		expect(testSubnets).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "GcpSubnet",
					cidr: `10.77.5.0/24`,
				}),
			]),
		);
		expect(testSubnets).toHaveLength(1);
	}, timeOut);
});
