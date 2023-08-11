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
//import { EC2 } from "aws-sdk";

export async function getVpcs(account: AwsAccount): Promise<AwsVpc[]> {
	// TODO: Do we still want the user to have the option to find VPCs in a single region?

	const ec2Client = new EC2Client({
		region: account.region,
	});

	//const ec2 = new EC2({region: ''});

	const regionRes = await ec2Client.send(new DescribeRegionsCommand({}));

	const vpcs: AwsVpc[] = [];
	if (!regionRes.Regions) {
		throw new Error("no regions found!");
	}

		for (const region of regionRes.Regions) {
			// const vpcRes = ec2.describeVpcs(params, (err: AWS.AWSError, data: AWS.EC2.Types.DescribeVpcsResult) => {
			// 	if (err) {
			// 		console.log(err);
			// 	} else {
			// 		console.log("EC2 service find VPCs result");
			// 		console.log(data);
			// 	}
			// })
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

