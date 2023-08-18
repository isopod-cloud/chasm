import {
	AwsAccount,
	AwsSubnet,
	AwsVpc,
	AzureAccount,
	AzureSubnet,
	AzureVpc,
	BaseSubnet,
	Vpc,
	Config,
	GcpAccount,
	GcpSubnet,
	GcpVpc,
	IpV4Cidr,
} from "../types/new-types";
import { Nullable } from "../utils";

import * as aws from "@pulumi/aws";
import * as azure from "@pulumi/azure-native";
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

// TODO: remove enum in favor of zod unions
export enum AccountType {
	AwsAccount = "AwsAccount",
	AzureAccount = "AzureAccount",
	GcpAccount = "GcpAccount",
}

export enum VpcType {
	AwsVpc = "AwsVpc",
	AzureVpc = "AzureVpc",
	GcpVpc = "GcpVpc",
}

// TODO: move into types section, consider refactoring as a class or zod type. exported for testing
export interface BasePhaseOneResource {}

// TODO: move into types section, consider refactoring as a class or zod type. exported for testing
export interface BasePhaseOneVpc {
	resource: Nullable<BasePhaseOneResource>;
	cidrs: Array<IpV4Cidr>;
	subnets: Array<BaseSubnet>;
	vpc: Vpc;
}

// TODO: move into aws section, consider refactoring as a class or zod type. exported for testing
export interface AwsPhaseOneResource extends BasePhaseOneResource {
	vpnGateway: aws.ec2.VpnGateway;
}

// TODO: move into aws section, consider refactoring as a class or zod type. exported for testing
export interface AwsPhaseOneVpc extends BasePhaseOneVpc {
	type: VpcType.AwsVpc;
	resource: Nullable<AwsPhaseOneResource>;
	subnets: Array<AwsSubnet>;
	vpc: AwsVpc;
}

// TODO: move this into aws section
const buildForAwsAccount = (
	account: AwsAccount,
	mockup: boolean,
) => {
	const vpcArray: Array<[string, AwsPhaseOneVpc]> =
		account.vpcs?.map((vpc) => {
			const cidrs = vpc.subnets.map((subnet) => subnet.cidr);
			if (mockup) {
				return [vpc.id, { type: VpcType.AwsVpc, resource: null, cidrs, subnets: vpc.subnets, vpc }];
			} else {
				const vpnGateway = new aws.ec2.VpnGateway(
					`vpn-gateway/${account.id}/${vpc.id}`,
					{
						vpcId: vpc.id,
						tags: vpc.tags,
					},
				);

				return [
					vpc.id,
					{ type: VpcType.AwsVpc, resource: { vpnGateway }, cidrs, subnets: vpc.subnets, vpc },
				];
			}
		}) ?? [];
	return {
		type: AccountType.AwsAccount as const,
		mockup,
		vpcs: Object.fromEntries(vpcArray),
	};
};

// TODO: move into azure section, consider refactoring as a class or zod type. exported for testing
export interface AzurePhaseOneResource extends BasePhaseOneResource {
	gatewaySubnet: pulumi.Output<azure.network.GetSubnetResult>;
	publicIp: azure.network.PublicIPAddress;
	vpnGateway: azure.network.VirtualNetworkGateway;
}

// TODO: move into azure section, consider refactoring as a class or zod type. exported for testing
export interface AzurePhaseOneVpc extends BasePhaseOneVpc {
	type: VpcType.AzureVpc;
	resource: Nullable<AzurePhaseOneResource>;
	vpcName: string;
	resourceGroupNameTruncated: string;
	resourceGroupName: string;
	subnets: Array<AzureSubnet>;
	vpc: AzureVpc;
}

// TODO: move this into azure section
const buildForAzureAccount = (
	account: AzureAccount,
	mockup: boolean,
) => {
	const vpcArray: Array<[string, AzurePhaseOneVpc]> =
		account.vpcs?.map((vpc) => {
			const vpcName = vpc.id.split("/").slice(-1)[0];
			const resourceGroupNameTruncated = vpc.resourceGroupName
				.split("/")
				.slice(-1)[0];
			const cidrs = vpc.subnets.map((subnet) => subnet.cidr);
			if (mockup) {
				return [
					vpc.id,
					{
						type: VpcType.AzureVpc,
						resource: null,
						vpcName,
						resourceGroupNameTruncated,
						resourceGroupName: vpc.resourceGroupName,
						cidrs,
						subnets: vpc.subnets,
						vpc,
					},
				];
			} else {
				const gatewaySubnet = azure.network.getSubnetOutput({
					resourceGroupName: resourceGroupNameTruncated,
					virtualNetworkName: vpcName,
					subnetName: "GatewaySubnet",
				});

				const publicIp = new azure.network.PublicIPAddress(
					`public-ip/${vpc.id}`,
					{
						resourceGroupName: resourceGroupNameTruncated,
						publicIpAddressName: vpcName,
						location: vpc.region,
						publicIPAllocationMethod: "Static",
						tags: vpc.tags,
						sku: {
							name: "Standard",
							tier: "Regional",
						},
					},
				);

				const vpnGateway = new azure.network.VirtualNetworkGateway(
					`vpn-gateway/${vpc.id}`,
					{
						resourceGroupName: resourceGroupNameTruncated,
						enableBgp: false, // We can change this to do dynamic routing
						activeActive: false, // We're not gonna use HA.
						gatewayType: "VPN", // This is either VPN or ExpressRoute. We want VPN.
						virtualNetworkGatewayName: vpcName,
						vpnGatewayGeneration: "Generation2", // This can be None, Generation1, Generation2. We will almost always want Gen2, but technically it changes SKUs available to us.
						tags: vpc.tags,
						vpnType: "RouteBased", // This is from the list RouteBased, PolicyBased. We'll almost always want route based.
						sku: {
							name: "VpnGw2", // This can vary and selects from a list.
							tier: "VpnGw2", // This can vary but will generally be the same as the SKU name it seems?
						},
						ipConfigurations: [
							{
								name: "gwipconfig1",
								privateIPAllocationMethod: "Dynamic",
								publicIPAddress: {
									id: publicIp.id,
								},
								subnet: {
									id: gatewaySubnet.id!.apply((x) => x!), // TODO: fix the `!` nonsense
								},
							},
						],
					},
				);

				return [
					vpc.id,
					{
						type: VpcType.AzureVpc,
						resource: {
							gatewaySubnet,
							publicIp,
							vpnGateway,
						},
						vpcName,
						resourceGroupNameTruncated,
						resourceGroupName: vpc.resourceGroupName,
						cidrs,
						subnets: vpc.subnets,
						vpc,
					},
				];
			}
		}) ?? [];
	return {
		type: AccountType.AzureAccount as const,
		mockup,
		vpcs: Object.fromEntries(vpcArray),
	};
};

// TODO: move into gcp section, consider refactoring as a class or zod type. exported for testing
export interface GcpForwardingRules {
	esp: gcp.compute.ForwardingRule;
	ipsec: gcp.compute.ForwardingRule;
	ipsecNat: gcp.compute.ForwardingRule;
}

// TODO: move into gcp section, consider refactoring as a class or zod type. exported for testing
export interface GcpPhaseOneResource extends BasePhaseOneResource {
	network: pulumi.Output<gcp.compute.GetNetworkResult>;
	vpnGateway: gcp.compute.VPNGateway;
	publicIp: gcp.compute.Address;
	forwardingRules: GcpForwardingRules;
}

// TODO: move into gcp section, consider refactoring as a class or zod type. exported for testing
export interface GcpPhaseOneVpc extends BasePhaseOneVpc {
	type: VpcType.GcpVpc;
	resource: Nullable<GcpPhaseOneResource>;
	region: string;
	vpnName: string;
	subnets: Array<GcpSubnet>;
	vpc: GcpVpc;
}

// TODO: move this into gcp section
const buildForGcpAccount = (
	account: GcpAccount,
	mockup: boolean,
) => {
	const vpcArray: Array<[string, GcpPhaseOneVpc]> =
		account.vpcs?.map((vpc) => {
			const cidrs = vpc.subnets.map((subnet) => subnet.cidr);
			const region = vpc.subnets[0].region;
			const vpnName = vpc.id.split("/").slice(-1)[0];
			if (mockup) {
				return [
					vpc.id,
					{
						type: VpcType.GcpVpc,
						resource: null,
						region,
						vpnName,
						cidrs,
						subnets: vpc.subnets,
						vpc,
					},
				];
			} else {
				const network = gcp.compute.getNetworkOutput({
					name: vpc.networkName,
				});
				const vpnGateway = new gcp.compute.VPNGateway(`vpn-gateway/${vpc.id}`, {
					network: network.name,
					name: pulumi.interpolate`a-${vpnName}`,
					region: vpc.subnets[0].region,
					project: vpc.projectName,
				});
				const publicIp = new gcp.compute.Address(`public-ip/${vpc.id}`, {
					name: pulumi.interpolate`a-${vpnName}`,
					project: vpc.projectName,
					region: vpc.subnets[0].region,
					labels: vpc.tags,
				});
				const forwardingRules = {
					esp: new gcp.compute.ForwardingRule(`forwarding-rule/${vpc.id}/esp`, {
						name: pulumi.interpolate`a-${vpnName}-esp`,
						ipAddress: publicIp.address,
						ipProtocol: "ESP",
						region: vpc.subnets[0].region,
						target: vpnGateway.id,
					}),
					ipsec: new gcp.compute.ForwardingRule(
						`forwarding-rule/${vpc.id}/ipsec`,
						{
							name: pulumi.interpolate`a-${vpnName}-ipsec`,
							ipAddress: publicIp.address,
							ipProtocol: "UDP",
							region: vpc.subnets[0].region,
							portRange: "500",
							target: vpnGateway.id,
						},
					),
					ipsecNat: new gcp.compute.ForwardingRule(
						`forwarding-rule/${vpc.id}/ipsecNat`,
						{
							name: pulumi.interpolate`a-${vpnName}-ipsecnat`,
							ipAddress: publicIp.address,
							ipProtocol: "UDP",
							region: vpc.subnets[0].region,
							portRange: "4500",
							target: vpnGateway.id,
						},
					),
				} as const;
				return [
					vpc.id,
					{
						type: VpcType.GcpVpc,
						resource: {
							network,
							vpnGateway,
							publicIp,
							forwardingRules,
						},
						region,
						vpnName,
						cidrs,
						subnets: vpc.subnets,
						vpc,
					},
				];
			}
		}) ?? [];
	return {
		type: AccountType.GcpAccount as const,
		mockup,
		vpcs: Object.fromEntries(vpcArray),
	};
};

// TODO: move into types section, consider refactoring as a class or zod type. exported for testing
export interface BasePhaseOneAccount {
	type: AccountType;
	mockup: boolean;
}

export interface AwsPhaseOneAccount extends BasePhaseOneAccount {
	type: AccountType.AwsAccount;
	vpcs: Record<string, AwsPhaseOneVpc>;
}

export interface AzurePhaseOneAccount extends BasePhaseOneAccount {
	type: AccountType.AzureAccount;
	vpcs: Record<string, AzurePhaseOneVpc>;
}

export interface GcpPhaseOneAccount extends BasePhaseOneAccount {
	type: AccountType.GcpAccount;
	vpcs: Record<string, GcpPhaseOneVpc>;
}

export type PhaseOneVpc = AwsPhaseOneVpc | AzurePhaseOneVpc | GcpPhaseOneVpc;
export type PhaseOneAccount =
	| AwsPhaseOneAccount
	| AzurePhaseOneAccount
	| GcpPhaseOneAccount;

// exported for testing
export function buildPhase1Result(
	config: Config,
	mockup: boolean = false,
): Array<PhaseOneAccount> {
	return config.map((account) => {
		switch (account.type) {
			case "AwsAccount": {
				return buildForAwsAccount(account, mockup);
			}
			case "AzureAccount": {
				return buildForAzureAccount(account, mockup);
			}
			case "GcpAccount": {
				return buildForGcpAccount(account, mockup);
			}
			default: {
				void (account satisfies never);
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				throw new Error(`Unreachable code: unknown account type`);
			}
		}
	});
}
