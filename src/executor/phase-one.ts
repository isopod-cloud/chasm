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
import { Nullable, promiseOf } from "../utils";

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
	resource: BasePhaseOneResource;
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
	resource: AwsPhaseOneResource;
	subnets: Array<AwsSubnet>;
	vpc: AwsVpc;
}

// TODO: move this into aws section
const buildForAwsAccount = (account: AwsAccount): PhaseOneAccount => {
	const vpcArray: Array<[string, AwsPhaseOneVpc]> =
		account.vpcs?.map((vpc) => {
			const cidrs = vpc.subnets.map((subnet) => subnet.cidr);
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
		}) ?? [];
	return {
		type: AccountType.AwsAccount as const,
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
	resource: AzurePhaseOneResource;
	vpcName: string;
	resourceGroupNameTruncated: string;
	resourceGroupName: string;
	subnets: Array<AzureSubnet>;
	vpc: AzureVpc;
}

// TODO: move this into azure section
const buildForAzureAccount = (account: AzureAccount): PhaseOneAccount => {
	const vpcArray: Array<[string, AzurePhaseOneVpc]> =
		account.vpcs?.map((vpc) => {
			const vpcName = vpc.id.split("/").slice(-1)[0];
			const resourceGroupNameTruncated = vpc.resourceGroupName
				.split("/")
				.slice(-1)[0];
			const cidrs = vpc.subnets.map((subnet) => subnet.cidr);
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
		}) ?? [];
	return {
		type: AccountType.AzureAccount as const,
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
	resource: GcpPhaseOneResource;
	region: string;
	vpnName: string;
	subnets: Array<GcpSubnet>;
	vpc: GcpVpc;
}

// TODO: move this into gcp section
const buildForGcpAccount = (account: GcpAccount): PhaseOneAccount => {
	const vpcArray: Array<[string, GcpPhaseOneVpc]> =
		account.vpcs?.map((vpc) => {
			const cidrs = vpc.subnets.map((subnet) => subnet.cidr);
			const region = vpc.subnets[0].region;
			const vpnName = vpc.id.split("/").slice(-1)[0];
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
		}) ?? [];
	return {
		type: AccountType.GcpAccount as const,
		vpcs: Object.fromEntries(vpcArray),
	};
};

// TODO: move into types section, consider refactoring as a class or zod type. exported for testing
export interface BasePhaseOneAccount {
	type: AccountType;
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

export function buildPhase1Result(
	config: Config
): Array<PhaseOneAccount> {
	return config.map((account) => {
		switch (account.type) {
			case "AwsAccount": {
				return buildForAwsAccount(account);
			}
			case "AzureAccount": {
				return buildForAzureAccount(account);
			}
			case "GcpAccount": {
				return buildForGcpAccount(account);
			}
			default: {
				void (account satisfies never);
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				throw new Error(`Unreachable code: unknown account type`);
			}
		}
	});
}

// NOTE: There are other attributes in the pulumi aws objects, but these unwrapped ones are the
// ones we care to extract for now. Also, At the moment, we only unwrap for testing, but in future
// there might be non-test situations where unwrapping aws resources is useful.
export interface AwsVpnGatewayUnwrapped {
	id: string;
	vpcId: string;
	tags: Record<string, string> | undefined;
}

export interface AwsPhaseOneResourceUnwrapped {
	vpnGateway: AwsVpnGatewayUnwrapped;
}

export async function unwrapAwsResource(resource: AwsPhaseOneResource): Promise<AwsPhaseOneResourceUnwrapped> {
	return await promiseOf(pulumi.all([resource.vpnGateway.id, resource.vpnGateway.vpcId, resource.vpnGateway.tags]).apply(([
		id, vpcId, tags
	]) => {
		return pulumi.output({
			vpnGateway: {
				id,
				vpcId,
				tags
			},
		});
	}));
}

// NOTE: There are other attributes in the pulumi gcp objects, but these unwrapped ones are the
// ones we care to extract for now. Also, At the moment, we only unwrap for testing, but in future
// there might be non-test situations where unwrapping gcp resources is useful.
//
// NOTE: The "or undefined" in the member types below are imposed by pulumi gcp forwarding rules at
// build-time. In truth, only portRange is optional, all other attributes should always be present.
export interface GcpForwaringRuleUnwrapped {
	id: string | undefined;
	name: string | undefined;

	// TODO: After unwrapping ipAddress from the pulumi gcp object, we get a string, but we can
	// decide if it is helpful to convert this to a formal IpV4Address object
	ipAddress: string | undefined;
	ipProtocol: string | undefined;
	region: string | undefined;

	target: string | undefined;
	portRange: string | undefined;
}

export interface GcpForwardingRulesUnwrapped {
	esp: GcpForwaringRuleUnwrapped;
	ipsec: GcpForwaringRuleUnwrapped;
	ipsecNat: GcpForwaringRuleUnwrapped;
}

export interface GcpVpnGatewayUnwrapped {
	id: string;
	region: string;
	name: string;
}

export interface GcpPublicIpUnwrapped {
	id: string;

	// TODO: After unwrapping ipAddress from the pulumi gcp object, we get a string, but we can
	// decide if it is helpful to convert this to a formal IpV4Address object
	address: string;

	labels: Record<string, string> | undefined;
}

export interface GcpPhaseOneResourceUnwrapped {
	network: gcp.compute.GetNetworkResult;
	vpnGateway: GcpVpnGatewayUnwrapped;
	publicIp: GcpPublicIpUnwrapped;
	forwardingRules: GcpForwardingRulesUnwrapped;
}

export async function unwrapGcpResource(resource: GcpPhaseOneResource): Promise<GcpPhaseOneResourceUnwrapped> {
	// NOTE: pulumi.all() and apply() have a cap for max # of static pulumi Output parameters you
	// can pass into them. Therefore, we build one object just with the forwardingRules and pass
	// that into a subsequent invocation on pulumi.all() and apply() using the remainder of the
	// attributes. This is the simplest way to work around this limit.
	const forwardingRules: pulumi.Output<GcpForwardingRulesUnwrapped> = pulumi.all([
		resource.forwardingRules.esp.id,
		resource.forwardingRules.esp.name,
		resource.forwardingRules.esp.ipAddress,
		resource.forwardingRules.esp.ipProtocol,
		resource.forwardingRules.esp.region,
		resource.forwardingRules.esp.target,
		resource.forwardingRules.esp.portRange,

		resource.forwardingRules.ipsec.id,
		resource.forwardingRules.ipsec.name,
		resource.forwardingRules.ipsec.ipAddress,
		resource.forwardingRules.ipsec.ipProtocol,
		resource.forwardingRules.ipsec.region,
		resource.forwardingRules.ipsec.target,
		resource.forwardingRules.ipsec.portRange,

		resource.forwardingRules.ipsecNat.id,
		resource.forwardingRules.ipsecNat.name,
		resource.forwardingRules.ipsecNat.ipAddress,
		resource.forwardingRules.ipsecNat.ipProtocol,
		resource.forwardingRules.ipsecNat.region,
		resource.forwardingRules.ipsecNat.target,
		resource.forwardingRules.ipsecNat.portRange,

	]).apply(([
		forwardingRulesEspId,
		forwardingRulesEspName,
		forwardingRulesEspIpAddress,
		forwardingRulesEspIpProtocol,
		forwardingRulesEspRegion,
		forwardingRulesEspTarget,
		forwardingRulesEspPortRange,

		forwardingRulesIpSecId,
		forwardingRulesIpSecName,
		forwardingRulesIpSecIpAddress,
		forwardingRulesIpSecIpProtocol,
		forwardingRulesIpSecRegion,
		forwardingRulesIpSecTarget,
		forwardingRulesIpSecPortRange,

		forwardingRulesIpSecNatId,
		forwardingRulesIpSecNatName,
		forwardingRulesIpSecNatIpAddress,
		forwardingRulesIpSecNatIpProtocol,
		forwardingRulesIpSecNatRegion,
		forwardingRulesIpSecNatTarget,
		forwardingRulesIpSecNatPortRange,
	]) => {
		return pulumi.output({
			esp: {
				id: forwardingRulesEspId,
				name: forwardingRulesEspName,
				ipAddress: forwardingRulesEspIpAddress,
				ipProtocol: forwardingRulesEspIpProtocol,
				region: forwardingRulesEspRegion,
				target: forwardingRulesEspTarget,
				portRange: forwardingRulesEspPortRange,
			},
			ipsec: {
				id: forwardingRulesIpSecId,
				name: forwardingRulesIpSecName,
				ipAddress: forwardingRulesIpSecIpAddress,
				ipProtocol: forwardingRulesIpSecIpProtocol,
				region: forwardingRulesIpSecRegion,
				target: forwardingRulesIpSecTarget,
				portRange: forwardingRulesIpSecPortRange,
			},
			ipsecNat: {
				id: forwardingRulesIpSecNatId,
				name: forwardingRulesIpSecNatName,
				ipAddress: forwardingRulesIpSecNatIpAddress,
				ipProtocol: forwardingRulesIpSecNatIpProtocol,
				region: forwardingRulesIpSecNatRegion,
				target: forwardingRulesIpSecNatTarget,
				portRange: forwardingRulesIpSecNatPortRange,
			},
		});
	});

	return await promiseOf(pulumi.all([
		resource.network,
		resource.vpnGateway.id,
		resource.vpnGateway.region,
		resource.vpnGateway.name,
		resource.publicIp.id,
		resource.publicIp.address,
		resource.publicIp.labels,
		forwardingRules,
	]).apply(([
		network,
		vpnGatewayId,
		vpnGatewayRegion,
		vpnGatewayName,
		publicIpId,
		publicIpAddress,
		publicIpLabels,
		forwardingRules,
	]) => {
		return pulumi.output({
			network,
			vpnGateway: {
				id: vpnGatewayId,
				region: vpnGatewayRegion,
				name: vpnGatewayName
			},
			publicIp: {
				id: publicIpId,
				address: publicIpAddress,
				labels: publicIpLabels,
			},
			forwardingRules,
		});
	}));
}

// NOTE: There are other attributes in the pulumi azure objects, but these unwrapped ones are the
// ones we care to extract for now. Also, At the moment, we only unwrap for testing, but in future
// there might be non-test situations where unwrapping azure resources is useful.
export interface AzurePublicIpUnwrapped {

	id: string;

	// TODO: After unwrapping ipAddress from the pulumi azure object, if it's not undefined, then
	// we get a string, but we can decide if it is helpful to convert this to a formal IpV4Address
	// object
	ipAddress: string | undefined;

}

export interface AzureVpnGatewayUnwrapped {
	id: string;
	name: string;
	tags: Record<string, string> | undefined;
}

export interface AzurePhaseOneResourceUnwrapped {
	gatewaySubnet: azure.network.GetSubnetResult;
	publicIp: AzurePublicIpUnwrapped;
	vpnGateway: AzureVpnGatewayUnwrapped;
}

export async function unwrapAzureResource(resource: AzurePhaseOneResource): Promise<AzurePhaseOneResourceUnwrapped> {
	return await promiseOf(pulumi.all([
		resource.gatewaySubnet,
		resource.publicIp.id,
		resource.publicIp.ipAddress,
		resource.vpnGateway.id,
		resource.vpnGateway.name,
		resource.vpnGateway.tags,
	]).apply(([
		gatewaySubnet,
		publicIpId,
		publicIpAddress,
		vpnGatewayId,
		vpnGatewayName,
		vpnGatewayTags,
	]) => {
		return pulumi.output({
			gatewaySubnet,
			publicIp: {
				id: publicIpId,
				ipAddress: publicIpAddress,
			},
			vpnGateway: {
				id: vpnGatewayId,
				name: vpnGatewayName,
				tags: vpnGatewayTags,
			},
		});
	}));
}

export type PhaseOneResourceUnwrapped = AwsPhaseOneResourceUnwrapped | AzurePhaseOneResourceUnwrapped | GcpPhaseOneResourceUnwrapped;

// given an array of phase one accounts, we extract all resources and unwrap them, building them
// into a record with vpc id's as the key
export async function getUnwrappedResourceRecords(accounts: PhaseOneAccount[]): Promise<Record<string, PhaseOneResourceUnwrapped>> {
	const records: Record<string, PhaseOneResourceUnwrapped> = {};
	for (const account of accounts) {
		for (const vpcId in account.vpcs) {
			switch (account.type) {
				case AccountType.AwsAccount: {
					records[vpcId] = await unwrapAwsResource(account.vpcs[vpcId].resource);
					break;
				}
				case AccountType.AzureAccount: {
					records[vpcId] = await unwrapAzureResource(account.vpcs[vpcId].resource);
					break;
				}
				case AccountType.GcpAccount: {
					records[vpcId] = await unwrapGcpResource(account.vpcs[vpcId].resource);
					break;
				}
				default: {
					throw new Error(`unsupported Account Type`);
				}
			}
		}
	}
	return records;
}
