import { getVpcs } from "./aws";
import {
	AwsVpc,
	AwsSubnet,
	AwsAccount,
} from "../types/new-types";
import { getAccountConfigForTest } from "../utils";
import {
	DescribeSubnetsCommand,
	DescribeVpcsCommand,
	DescribeVpcsCommandOutput,
	EC2Client,
	CreateVpcCommand,
	CreateSubnetCommand,
	DeleteSubnetCommand,
	DeleteVpcCommand,
} from "@aws-sdk/client-ec2";

// AWS Helper Functions may be replaced by some fixturizers or whatnot
async function createAwsTestFixturesDA(
	ec2Client: EC2Client,
	numSubnets: number,
): Promise<void> {
	const vpcInput = {
		CidrBlock: "10.0.0.0/16",
		TagSpecifications: [
			{
				ResourceType: "vpc",
				Tags: [
					{
						Key: "Osp",
						Value: "test",
					},
				],
			},
		],
	};
	const vpcCommand = new CreateVpcCommand(vpcInput);
	const createVpcResponse = await ec2Client.send(vpcCommand);

	for (let i = 0; i < numSubnets; ++i) {
		const subnetInput = {
			CidrBlock: `10.0.${i}.0/24`,
			VpcId: createVpcResponse.Vpc?.VpcId,
			TagSpecifications: [
				{
					ResourceType: "subnet",
					Tags: [
						{
							Key: "Osp",
							Value: "test",
						},
					],
				},
			],
		};
		const subnetCommand = new CreateSubnetCommand(subnetInput);
		const _createSubnetResponse = await ec2Client.send(subnetCommand);
	}
};

async function destroyAwsTestFixturesDA(
	ec2Client: EC2Client,
): Promise<void> {
	const describeSubInput = {
		Filters: [
			{
				Name: "tag:Osp",
				Values: ["test"],
			},
		],
	};
	const { Subnets } = await ec2Client.send(
		new DescribeSubnetsCommand(describeSubInput),
	);
	if (!Subnets) {
		throw new Error("no subnets?");
	}
	for (const subnet of Subnets) {
		const subnetInput = {
			SubnetId: subnet.SubnetId,
			//DryRun: false,
		};
		const subnetCommand = new DeleteSubnetCommand(subnetInput);
		const _deleteSubnetResponse = await ec2Client.send(subnetCommand);
	}

	const vpc: DescribeVpcsCommandOutput = await ec2Client.send(
		new DescribeVpcsCommand({
			Filters: [
				{
					Name: "tag:Osp",
					Values: ["test"],
				},
			],
		}),
	);
	if (!vpc?.Vpcs?.at(0)?.VpcId) {
		throw new Error("should be a vpc");
	}
	const vpcInput = {
		VpcId: vpc.Vpcs?.at(0)?.VpcId,
		//DryRun: false,
	};
	const vpcCommand = new DeleteVpcCommand(vpcInput);
	const _deleteVpcResponse = await ec2Client.send(vpcCommand);
};

describe("discovery agent tests for aws", () => {
	const numSubnets = 3;
	const awsAccount = getAccountConfigForTest("./config.json", "AwsAccount") as AwsAccount; // If this function didn't error, this has to be an AwsAccount
	const ec2Client = new EC2Client({
		region: awsAccount.region,
	});

	beforeAll(async () => {
		await createAwsTestFixturesDA(ec2Client, numSubnets);
	});
	afterAll(async () => {
		await destroyAwsTestFixturesDA(ec2Client);
	});
	it("should get test vpc and associated subnets from aws account(s)", async () => {
		const result: AwsVpc[] = await getVpcs(awsAccount);

		let testSubnets: AwsSubnet[] | undefined = undefined;

		for (const res of result) {
			if (
				res.tags &&
				res.tags["osp"] === "test"
			) {
				testSubnets = res.subnets;
			}
		}

		expect(result).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "AwsVpc",
					region: "us-east-2",
					cidr: "10.0.0.0/16",
					tags: [
						{
							key: "Osp",
							value: "test",
						},
					],
				}),
			]),
		);

		for (let i = 0; i < numSubnets; ++i) {
			expect(testSubnets).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: "AwsSubnet",
						cidr: `10.0.${i}.0/24`,
					}),
				]),
			);
		}

		expect(testSubnets).toHaveLength(numSubnets);
	});
});
