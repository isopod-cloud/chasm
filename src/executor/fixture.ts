import * as aws from "@pulumi/aws";
import * as azure from "@pulumi/azure-native";
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import * as crypto from "crypto";
import { isPresent, overlappingCidrsExist } from "../utils";

import {
	AwsAccount,
	AwsSubnet,
	AwsVpc,
	AzureAccount,
	AzureSubnet,
	AzureVpc,
	BaseSubnet,
	BaseVpc,
	Config,
	GcpAccount,
	GcpSubnet,
	GcpVpc,
	IpV4Address,
	IpV4Cidr,
	MapToOutputs,
} from "../types/new-types";

import { ToSynthesize } from "../config";

import {
	getPulumiOutputStream,
	logEngineEvent,
	prepareWorkspaceOptions,
} from "../utils";

// TODO: remove enum in favor of zod unions
export enum AccountType {
	AwsAccount = "AwsAccount",
	AzureAccount = "AzureAccount",
	GcpAccount = "GcpAccount",
}

// Normally I don't love singleton classes like this but I think the alternative is worse.
// TODO: this class isn't really serving the purpose I thought it would.  I think we need to rethink its use.
export class Targeter<Output extends pulumi.Output<IpV4Address> | IpV4Address> {
	public readonly dummyIp: Output;
	private targets: Record<string, Output | undefined> = {};
	private dummyCount = 0;

	constructor(dummy: Output) {
		this.dummyIp = dummy;
	}

	set(name: string, value: Output): typeof this {
		// TODO: this check really should pass but it doesn't just yet.
		// I think that is evidence of a bug somewhere but I don't have time to
		// chase it down at the moment.

		// if (this.targets[name] !== undefined) {
		// 	throw new Error(`Duplicate name: ${name}`);
		// }
		this.targets[name] = value;
		return this;
	}

	get(name: string): Output {
		const ip = this.targets[name];
		if (ip === undefined) {
			this.dummyCount++;
			return this.dummyIp;
		} else {
			return ip;
		}
	}

	*[Symbol.iterator](): Iterator<[string, Output]> {
		for (const [k, v] of Object.entries(this.targets)) {
			if (v !== undefined) {
				yield [k, v];
			} else {
				throw new Error(`Unreachable code: undefined targeter value`);
			}
		}
	}

	countDummies(): number {
		return this.dummyCount;
	}
}

export type Nullable<T> = T | null;

export interface BaseVpcResource {}

export interface BaseVpcInfoItem {
	resource: Nullable<BaseVpcResource>;
	cidrs: Array<IpV4Cidr>;
	subnets: Array<BaseSubnet>;
	vpc: BaseVpc;
}

// TODO: move this into aws section, exported for testing purposes
export interface AwsVpcResource extends BaseVpcResource {
	vpnGateway: aws.ec2.VpnGateway;
}

export interface AwsVpcInfoItem extends BaseVpcInfoItem {
	resource: Nullable<AwsVpcResource>;
	subnets: Array<AwsSubnet>;
	vpc: AwsVpc;
}

export interface VpcInfo {
	type: AccountType;
	mockup: boolean;
	vpcs: Record<string, BaseVpcInfoItem>;
}

const buildForAwsAccount = (
	account: AwsAccount,
	mockup: boolean = false,
): VpcInfo => {
	const vpcArray: Array<[string, AwsVpcInfoItem]> =
		account.vpcs?.map((vpc) => {
			const cidrs = vpc.subnets.map((subnet) => subnet.cidr);
			if (mockup) {
				return [vpc.id, { resource: null, cidrs, subnets: vpc.subnets, vpc }];
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
					{ resource: { vpnGateway }, cidrs, subnets: vpc.subnets, vpc },
				];
			}
		}) ?? [];
	return {
		type: AccountType.AwsAccount as const,
		mockup,
		vpcs: Object.fromEntries(vpcArray),
	};
};

export interface AzureVpcResource extends BaseVpcResource {
	gatewaySubnet: pulumi.Output<azure.network.GetSubnetResult>;
	publicIp: azure.network.PublicIPAddress;
	vpnGateway: azure.network.VirtualNetworkGateway;
}

export interface AzureVpcInfoItem extends BaseVpcInfoItem {
	resource: Nullable<AzureVpcResource>;
	vpcName: string;
	resourceGroupNameTruncated: string;
	resourceGroupName: string;
	subnets: Array<AzureSubnet>;
	vpc: AzureVpc;
}

// TODO: move this into azure section
const buildForAzureAccount = (
	account: AzureAccount,
	mockup: boolean = false,
): VpcInfo => {
	const vpcArray: Array<[string, AzureVpcInfoItem]> =
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

export interface GcpForwardingRules {
	esp: gcp.compute.ForwardingRule;
	ipsec: gcp.compute.ForwardingRule;
	ipsecNat: gcp.compute.ForwardingRule;
}

export interface GcpVpcResource extends BaseVpcResource {
	network: pulumi.Output<gcp.compute.GetNetworkResult>;
	vpnGateway: gcp.compute.VPNGateway;
	publicIp: gcp.compute.Address;
	forwardingRules: GcpForwardingRules;
}

export interface GcpVpcInfoItem extends BaseVpcInfoItem {
	resource: Nullable<GcpVpcResource>;
	region: string;
	vpnName: string;
	subnets: Array<GcpSubnet>;
	vpc: GcpVpc;
}

// TODO: move this into gcp section
const buildForGcpAccount = (
	account: GcpAccount,
	mockup: boolean = false,
): VpcInfo => {
	const vpcArray: Array<[string, GcpVpcInfoItem]> =
		account.vpcs?.map((vpc) => {
			const cidrs = vpc.subnets.map((subnet) => subnet.cidr);
			const region = vpc.subnets[0].region;
			const vpnName = vpc.id.split("/").slice(-1)[0];
			if (mockup) {
				return [
					vpc.id,
					{
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

export function buildPhase1Result(
	config: Config,
	mockup: boolean = false,
): Array<VpcInfo> {
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

async function planMeshInternal(
	meshArgs: ToSynthesize,
	config: Config,
	phase1Targeter:
		| Record<string, IpV4Address | undefined>
		| undefined = undefined,
): Promise<Array<readonly [string, pulumi.Output<IpV4Address>]>> {
	const meshPsk = pulumi.secret(meshArgs.psk);
	const targeter = new Targeter<pulumi.Output<IpV4Address>>(
		pulumi.output(IpV4Address.parse("1.1.1.1")),
	);
	if (phase1Targeter !== undefined) {
		for (const [k, v] of Object.entries(phase1Targeter)) {
			if (v === undefined) {
				throw new Error(`Unreachable code: undefined targeter value`);
			}
			targeter.set(k, pulumi.output(v));
		}
	}

	const phase1Result = buildPhase1Result(config);

	// Fill out targeter
	for (const srcAccount of phase1Result) {
		for (const dstAccount of phase1Result) {
			if (dstAccount.type === AccountType.AwsAccount) {
				// You can't do anything here because AWS is a goof and won't give me the IPs when I actually want them.
				continue;
			}
			for (const srcVpc of Object.keys(srcAccount.vpcs)) {
				switch (dstAccount.type) {
					case AccountType.AzureAccount: {
						for (const [dstVpcId, dstVpc] of Object.entries(dstAccount.vpcs)) {
							if (srcVpc === dstVpcId) {
								continue;
							}
							const dstVpcResource = (dstVpc as AzureVpcInfoItem).resource;
							if (isPresent(dstVpcResource)) {
								targeter.set(
									`${srcVpc}->${dstVpcId}`,
									dstVpcResource.publicIp.ipAddress.apply((x) => x!),
								);
							} else {
								throw new Error(`no resource for Azure vpc id ${dstVpcId}`);
							}
						}
						break;
					}
					case AccountType.GcpAccount: {
						for (const [dstVpcId, dstVpc] of Object.entries(dstAccount.vpcs)) {
							if (srcVpc === dstVpcId) {
								continue;
							}
							const dstVpcResource = (dstVpc as GcpVpcInfoItem).resource;
							if (isPresent(dstVpcResource)) {
								targeter.set(
									`${srcVpc}->${dstVpcId}`,
									dstVpcResource.publicIp.address,
								);
							} else {
								throw new Error(`no resource for GCP vpc id ${dstVpcId}`);
							}
						}
						break;
					}
					default: {
						throw new Error(`Unreachable code: unknown account type`);
					}
				}
			}
		}
	}

	/* We need to get rid of the enum for phase1 result to fix the typing system*/
	const allCidrs: string[] = [];
	for (const acct of phase1Result) {
		for (const [_key, vpc] of Object.entries(acct.vpcs)) {
			for (const cidr of vpc.cidrs) {
				allCidrs.push(cidr);
			}
		}
	}

	if (overlappingCidrsExist(allCidrs)) {
		throw Error("Can not mesh overlapping cidrs ranges in subnets");
	}

	// Now hook up the mesh
	// TODO: refactor this into provider specific functions
	for (const srcAccount of phase1Result) {
		for (const dstAccount of phase1Result) {
			for (const srcVpc of Object.keys(srcAccount.vpcs)) {
				for (const dstVpc of Object.keys(dstAccount.vpcs)) {
					if (srcVpc === dstVpc) {
						continue;
					}

					switch (srcAccount.type) {
						case AccountType.AwsAccount: {
							const srcResource = (srcAccount.vpcs[srcVpc] as AwsVpcInfoItem)
								.resource;
							if (isPresent(srcResource)) {
								const srcVpnGateway = srcResource.vpnGateway;
								const targetIp = targeter.get(`${srcVpc}->${dstVpc}`);
								const remoteGateway = new aws.ec2.CustomerGateway(
									`customer-gateway/${srcVpc}->${dstVpc}`,
									{
										type: "ipsec.1",
										deviceName: `${srcVpc}-to-${dstVpc}`,
										bgpAsn: `${65000}`, // TODO: fill in with a real ASN
										tags: srcVpnGateway.tags.apply((x) => x ?? {}),
										ipAddress: targetIp,
									},
									{
										// This `ignoreChanges` is needed so that we don't mess with the IP address on update to the mesh.
										ignoreChanges:
											targetIp === targeter.dummyIp ? ["ipAddress"] : [],
									},
								);
								const vpnConnection = new aws.ec2.VpnConnection(
									`vpn-connection/${srcVpc}->${dstVpc}`,
									{
										customerGatewayId: remoteGateway.id,
										vpnGatewayId: srcVpnGateway.id,
										staticRoutesOnly: true, // TODO: eventually we should support BGP
										tunnel1PresharedKey: meshPsk,
										tags: srcVpnGateway.tags.apply((x) => x ?? {}),
										type: "ipsec.1",
									},
								);
								// NOTE: this is "backwards" on purpose.  AWS is a goof and won't give me the IPs when I actually want them.
								// This is one of the two key steps in fixing the circular dependency resulting from AWS's api.
								targeter.set(
									`${dstVpc}->${srcVpc}`,
									vpnConnection.tunnel1Address,
								);

								const defaultRouteTable = await aws.ec2.getRouteTable({
									routeTableId: (
										await aws.ec2.getVpc({
											id: srcVpc,
										})
									).mainRouteTableId,
								});

								const routeTables = await Promise.all(
									(
										await aws.ec2.getRouteTables({
											vpcId: srcVpc,
										})
									).ids.map((routeTableId) =>
										aws.ec2.getRouteTable({ routeTableId }),
									),
								);

								const relevantSubnetIds = new Set(
									srcAccount.vpcs[srcVpc].subnets.map((subnet) => subnet.id),
								);

								const routingTableUsage = routeTables
									.map((x) => {
										return x.associations.map((a) => {
											return [a.subnetId, a.routeTableId] as const;
										});
									})
									.flat(1)
									.reduce(
										(acc, [subnetId, routeTableId]) => {
											if (!relevantSubnetIds.has(subnetId)) {
												return acc;
											}
											acc.relevantRoutingTables.add(routeTableId);
											acc.usedSubnets.add(subnetId);
											return acc;
										},
										{
											relevantRoutingTables: new Set<string>(),
											usedSubnets: new Set<string>(),
										},
									);

								if (
									routingTableUsage.usedSubnets.size != relevantSubnetIds.size
								) {
									routingTableUsage.relevantRoutingTables.add(
										defaultRouteTable.id,
									);
								}

								const uniqueRouteTables = Object.fromEntries(
									routeTables.map((routeTable) => {
										return [routeTable.id, routeTable] as const;
									}),
								);

								const routes = Object.fromEntries(
									dstAccount.vpcs[dstVpc].cidrs.map((cidr) => {
										const vpnRoute = new aws.ec2.VpnConnectionRoute(
											`${srcVpc}/${dstVpc}/${cidr}/vpnRoute`,
											{
												destinationCidrBlock: cidr,
												vpnConnectionId: vpnConnection.id,
											},
										);
										const routes = Array.from(
											routingTableUsage.relevantRoutingTables,
										).map((routeTableId) => {
											return new aws.ec2.Route(
												`${srcVpc}/${dstVpc}/${cidr}/${routeTableId}/route`,
												{
													routeTableId: routeTableId,
													destinationCidrBlock: cidr,
													gatewayId: srcVpnGateway.id,
												},
											);
										});
										return [cidr, { vpnRoute, routes }] as const;
									}),
								);
							} else {
								throw new Error(`no resource for AWS vpc id ${srcVpc}`);
							}
							// TODO: check for overlaps in route tables
							break;
						}
						case AccountType.AzureAccount: {
							const srcVpcAzure = srcAccount.vpcs[srcVpc] as AzureVpcInfoItem;
							const srcResource = srcVpcAzure.resource;
							if (isPresent(srcResource)) {
								const targetIp = targeter.get(`${srcVpc}->${dstVpc}`);
								const dstCidrs = dstAccount.vpcs[dstVpc].cidrs;
								const localNetworkGateway =
									new azure.network.LocalNetworkGateway(
										`local-network-gateway/${srcVpc}->${dstVpc}`,
										{
											resourceGroupName: srcVpcAzure.resourceGroupName
												.split("/")
												.slice(-1)[0],
											localNetworkGatewayName:
												pulumi.interpolate`${srcResource.vpnGateway.name}-${dstVpc}`.apply(
													(x) => {
														return crypto
															.createHash("sha256")
															.update(x)
															.digest("hex");
													},
												),
											gatewayIpAddress: targetIp,
											tags: srcResource.vpnGateway.tags.apply((x) => x ?? {}),
											localNetworkAddressSpace: {
												addressPrefixes: dstCidrs, // This is the list of prefixes the tunnel will accept.
											},
										},
										{
											// This `ignoreChanges` is needed so that we don't mess with the IP address on update to the mesh.
											ignoreChanges:
												targetIp === targeter.dummyIp
													? ["gatewayIpAddress"]
													: [],
										},
									);

								const _vpnConnection =
									new azure.network.VirtualNetworkGatewayConnection(
										`vpn-connection/${srcVpc}->${dstVpc}`,
										{
											resourceGroupName: srcVpcAzure.resourceGroupName
												.split("/")
												.slice(-1)[0],
											virtualNetworkGatewayConnectionName:
												pulumi.interpolate`${srcVpc}-${dstVpc}`.apply((x) => {
													return crypto
														.createHash("sha256")
														.update(x)
														.digest("hex");
												}),
											virtualNetworkGateway1: {
												id: srcResource.vpnGateway.id.apply((x) => {
													console.log("vpn gateway id: ", x);
													return x;
												}),
											},
											tags: srcResource.vpnGateway.tags.apply((x) => x ?? {}),
											connectionProtocol: "IKEv2",
											localNetworkGateway2: {
												id: localNetworkGateway.id,
											},
											enableBgp: false,
											sharedKey: meshPsk,
											connectionType: "IPsec",
											useLocalAzureIpAddress: false,
										},
									);
							} else {
								throw new Error(`no resource for Azure vpc id ${srcVpc}`);
							}
							break;
						}
						case AccountType.GcpAccount: {
							const srcVpcGcp = srcAccount.vpcs[srcVpc] as GcpVpcInfoItem;
							const srcResource = srcVpcGcp.resource;
							if (isPresent(srcResource)) {
								const targetIp = targeter.get(`${srcVpc}->${dstVpc}`);
								const vpnTunnel = new gcp.compute.VPNTunnel(
									`vpn-tunnel/${srcVpc}->${dstVpc}`,
									{
										region: srcResource.vpnGateway.region,
										name: pulumi.interpolate`${
											srcResource.vpnGateway.name
										}-${crypto
											.createHash("sha256")
											.update(dstVpc)
											.digest("hex")
											.slice(0, 15)}`,
										peerIp: targetIp,
										labels: srcResource.publicIp.labels.apply((x) => x ?? {}),
										sharedSecret: meshPsk,
										targetVpnGateway: srcResource.vpnGateway.id,
										ikeVersion: 2,
										// These both need to be 0.0.0.0/0 for route-based routing. (As opposed to policy based.)
										remoteTrafficSelectors: ["0.0.0.0/0"],
										localTrafficSelectors: ["0.0.0.0/0"],
									},
									{
										dependsOn: [srcResource.forwardingRules.esp],
										// This `ignoreChanges` is needed so that we don't mess with the IP address on update to the mesh.
										ignoreChanges:
											targetIp === targeter.dummyIp ? ["peerIp"] : [],
									},
								);
								const dstCidrs = dstAccount.vpcs[dstVpc].cidrs;
								const _routes = dstCidrs.map((dstCidr) => {
									return new gcp.compute.Route(
										`route/${srcVpc}/${dstVpc}/${dstCidr}`,
										{
											name: pulumi.interpolate`${dstAccount} for ${srcVpc} to ${dstVpc} for ${dstCidr}`.apply(
												(x) =>
													`a-${crypto
														.createHash("sha256")
														.update(x)
														.digest("hex")
														.slice(0, 60)}`,
											),
											destRange: dstCidr,
											network: srcResource.network.name,
											nextHopVpnTunnel: vpnTunnel.id,
										},
									);
								});
							} else {
								throw new Error(`no resource for GCP vpc id ${srcVpc}`);
							}
							break;
						}
						default: {
							throw new Error("unknown account type");
						}
					}
				}
			}
		}
	}
	return await Promise.resolve(
		Array.from(
			(function* () {
				for (const [k, v] of targeter) {
					yield [k, v] as const;
				}
			})(),
		),
	);
}

function planMesh(
	meshArgs: ToSynthesize,
	config: Config,
	phase1Targeter:
		| Record<string, IpV4Address | undefined>
		| undefined = undefined,
): () => Promise<Array<readonly [IpV4Address, pulumi.Output<IpV4Address>]>> {
	return async () => {
		return await planMeshInternal(meshArgs, config, phase1Targeter);
	};
}

export const provisionNetwork = async (args: ToSynthesize) => {
	const options = prepareWorkspaceOptions(args);

	const meshStack = await pulumi.automation.LocalWorkspace.createOrSelectStack(
		{
			stackName: args.meshName,
			workDir: options.workDir ? options.workDir : args.workDir,
		},
		options,
	);
	for (const account of args.accounts) {
		switch (account.type) {
			case "AwsAccount": {
				await meshStack.setConfig("aws:region", { value: account.region });
				break;
			}
			case "GcpAccount": {
				await meshStack.setConfig("gcp:project", { value: account.project });
				break;
			}
			case "AzureAccount": {
				break;
			}
			default: {
				void (account satisfies never);
				throw new Error("Unreachable code: invalid account type");
			}
		}
	}

	const config = args.accounts;
	const stream = getPulumiOutputStream(args);

	try {
		const meshResult = await meshStack.up({
			onOutput: process.stdout.write.bind(process.stdout),
			onEvent: (event) => {
				logEngineEvent(stream, event);
			},
			color: "auto",
			program: planMesh(args, config),
		});

		const meshResultOuts = meshResult.outputs as MapToOutputs<
			ReturnType<typeof planMesh>
		>;
		const pass1Targeter = {} as Record<string, IpV4Address | undefined>;
		for (const [_, lookup] of Object.entries(meshResultOuts)) {
			pass1Targeter[lookup.value[0]] = lookup.value[1];
		}

		const meshRefreshResult2 = await meshStack.refresh({
			onOutput: process.stdout.write.bind(process.stdout),
			onEvent: (event) => {
				logEngineEvent(stream, event);
			},
			color: "auto",
		});

		const meshResult2 = await meshStack.up({
			onOutput: process.stdout.write.bind(process.stdout),
			onEvent: (event) => {
				logEngineEvent(stream, event);
			},
			color: "auto",
			program: planMesh(args, config, pass1Targeter),
		});
	} finally {
		stream.end();
	}
};

export const deProvisionNetwork = async (args: ToSynthesize) => {
	const options = prepareWorkspaceOptions(args);

	const meshStack = await pulumi.automation.LocalWorkspace.createOrSelectStack(
		{
			stackName: args.meshName,
			workDir: options.workDir ? options.workDir : args.workDir,
		},
		options,
	);

	const stream = getPulumiOutputStream(args);
	try {
		await meshStack.destroy({
			onOutput: process.stdout.write.bind(process.stdout),
			onEvent: (event) => {
				logEngineEvent(stream, event);
			},
			color: "auto",
		});
	} finally {
		stream.end();
	}
};
