import {
	DescribeSubnetsCommand,
	DescribeVpcsCommand,
	DescribeVpcsCommandOutput,
	DescribeSubnetsCommandOutput,
	EC2Client,
	DescribeRegionsCommand,
} from "@aws-sdk/client-ec2";
import { AwsVpc, AwsSubnet, AwsAccount } from "../types/new-types";
import { isPresent } from "../utils";

export async function getVpcs(account: AwsAccount): Promise<AwsVpc[]> {

	const ec2Client = new EC2Client({
		region: account.region,
	});

	const regionRes = await ec2Client.send(new DescribeRegionsCommand({}));

	const vpcs: AwsVpc[] = [];
	if (!regionRes.Regions) {
		throw new Error("no regions found!");
	}

		for (const region of regionRes.Regions) {
			const ec2Client = new EC2Client({
				region: region.RegionName,
			});

			const { Vpcs }: DescribeVpcsCommandOutput = await ec2Client.send(
				new DescribeVpcsCommand({}),
			);

			if (isPresent(Vpcs)) {
				for (const vpc of Vpcs) {
					const subnet: DescribeSubnetsCommandOutput = await ec2Client.send(
						new DescribeSubnetsCommand({
							Filters: [{ Name: "vpc-id", Values: [vpc.VpcId!] }],
						}),
					);
					const subnets = subnet.Subnets?.map((subnet) =>
						AwsSubnet.parse({
							id: subnet.SubnetId,
							cidr: subnet.CidrBlock,
							type: "AwsSubnet",
						}),
					);
					vpcs.push(
						AwsVpc.parse({
							id: vpc.VpcId,
							type: "AwsVpc",
							region: region.RegionName,
							cidr: vpc.CidrBlock,
							subnets: subnets,
						}),
					);
				}
			}
	}

	return vpcs;

}

export default { getVpcs };

