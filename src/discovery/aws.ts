import {
	DescribeSubnetsCommand,
	DescribeVpcsCommand,
	DescribeVpcsCommandOutput,
	DescribeSubnetsCommandOutput,
	EC2Client,
} from "@aws-sdk/client-ec2";
import { AwsVpc, AwsSubnet, AwsAccount } from "../types/new-types";
import { isPresent } from "../utils";

export async function getVpcs(account: AwsAccount): Promise<AwsVpc[]> {
	/* TODO: Should we expect region to be passed in? Or should we check for all regions like GCP?  */
	const ec2Client = new EC2Client({
		region: account.region,
	});

	const { Vpcs }: DescribeVpcsCommandOutput = await ec2Client.send(
		new DescribeVpcsCommand({}),
	);

	const vpcs: AwsVpc[] = [];

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
					region: account.region,
					cidr: vpc.CidrBlock,
					subnets: subnets,
				}),
			);
		}
	}
	return vpcs;
}

export default { getVpcs };
