import { ToSynthesize } from "../config";
import {
	Config,
	IpV4Address,
	Tags,
	AwsVpc,
	AzureVpc,
	GcpVpc,
} from "../types/new-types";

import { Targeter } from "./targeter";
import { AccountType, PhaseOneVpc, buildPhase1Result } from "./phase-one";
import { isPresent, overlappingCidrsExist } from "../utils";

import * as aws from "@pulumi/aws";
import * as azure from "@pulumi/azure-native";
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import * as crypto from "crypto";

const awsMakeSecurityGroup = (
	provider: aws.Provider | undefined,
	vpc: AwsVpc,
	tags: Tags,
	cidrs: string[],
): void => {
	new aws.ec2.SecurityGroup(
		`security-group/${vpc.id}`,
		{
			name: pulumi.interpolate`Allow-${vpc.id.split("/").slice(-1)[0]}`,
			tags: tags,
			description: `Permit all traffic to/from the mesh.`,
			vpcId: vpc.id,
			egress: [
				{
					description: `Permit all traffic to the mesh.`,
					cidrBlocks: cidrs,
					protocol: "all",
					fromPort: 0,
					toPort: 0,
				},
			],
			ingress: [
				{
					description: `Permit all traffic from the mesh.`,
					cidrBlocks: cidrs,
					protocol: "all",
					fromPort: 0,
					toPort: 0,
				},
			],
		},
		{
			provider,
		},
	);
};

const azureMakeSecurityGroup = (
	provider: azure.Provider | undefined,
	vpc: AzureVpc,
	tags: Tags,
	cidrs: string[],
): void => {
	new azure.network.NetworkSecurityGroup(
		`security-group/${vpc.id}`,
		{
			resourceGroupName: vpc.resourceGroupName,
			networkSecurityGroupName: pulumi.interpolate`Allow-${
				vpc.id.split("/").slice(-1)[0]
			}`,
			securityRules: [
				{
					description: `Permit all traffic from the mesh.`,
					priority: 200,
					access: "Allow",
					direction: "Inbound",
					protocol: "*",
					sourceAddressPrefixes: cidrs,
					sourcePortRange: "*",
					destinationAddressPrefix: "*",
					destinationPortRange: "*",
					name: "ingress",
				},
				{
					description: `Permit all traffic to the mesh.`,
					priority: 300,
					access: "Allow",
					direction: "Outbound",
					protocol: "*",
					sourceAddressPrefix: "*",
					sourcePortRange: "*",
					destinationAddressPrefixes: cidrs,
					destinationPortRange: "*",
					name: "egress",
				},
			],
			tags: tags,
		},
		{
			provider,
		},
	);
};

const gcpMakeFirewallPolicy = (
	provider: gcp.Provider | undefined,
	vpc: GcpVpc,
	cidrs: string[],
): void => {
	const policy = new gcp.compute.NetworkFirewallPolicy(
		`firewall-policy/${vpc.id}`,
		{
			project: vpc.projectName,
			name: pulumi.interpolate`Allow-${vpc.id.split("/").slice(-1)[0]}`,
			description: `Permit all traffic to/from the mesh.`,
		},
		{
			provider,
		},
	);
	const _ingressRule = new gcp.compute.NetworkFirewallPolicyRule(
		`firewall-rule/${vpc.id}/ingress`,
		{
			project: vpc.projectName,
			ruleName: "ingress",
			action: "allow",
			direction: "INGRESS",
			description: `Permit all traffic from the mesh.`,
			priority: 200,
			firewallPolicy: policy.name,
			match: {
				srcIpRanges: cidrs,
				destIpRanges: ["0.0.0.0/0"],
				layer4Configs: [
					{
						ipProtocol: "all",
					},
				],
			},
		},
		{
			provider,
		},
	);
	const _egressRule = new gcp.compute.NetworkFirewallPolicyRule(
		`firewall-rule/${vpc.id}/egress`,
		{
			project: vpc.projectName,
			ruleName: "egress",
			action: "allow",
			direction: "EGRESS",
			description: `Permit all traffic to the mesh.`,
			priority: 300,
			firewallPolicy: policy.name,
			match: {
				destIpRanges: cidrs,
				srcIpRanges: ["0.0.0.0/0"],
				layer4Configs: [
					{
						ipProtocol: "all",
					},
				],
			},
		},
		{
			provider,
		},
	);
};

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
							const dstPhaseOneResource = dstVpc.resource;
							if (isPresent(dstPhaseOneResource)) {
								targeter.set(
									`${srcVpc}->${dstVpcId}`,
									dstPhaseOneResource.publicIp.ipAddress.apply((x) => x!),
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
							const dstPhaseOneResource = dstVpc.resource;
							if (isPresent(dstPhaseOneResource)) {
								targeter.set(
									`${srcVpc}->${dstVpcId}`,
									dstPhaseOneResource.publicIp.address,
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
		for (const [_key, vpc] of Object.entries<PhaseOneVpc>(acct.vpcs)) {
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
							const srcVpcAws = srcAccount.vpcs[srcVpc];
							const srcResource = srcVpcAws.resource;
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

								const _uniqueRouteTables = Object.fromEntries(
									routeTables.map((routeTable) => {
										return [routeTable.id, routeTable] as const;
									}),
								);

								const _routes = Object.fromEntries(
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
							const srcVpcAzure = srcAccount.vpcs[srcVpc];
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
							const srcVpcGcp = srcAccount.vpcs[srcVpc];
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

	if (meshArgs.makeSecurityGroups) {
		// Do the security groups
		for (const targetAccount of phase1Result) {
			for (const targetVpcId of Object.keys(targetAccount.vpcs)) {
				// This silly step is required because the static analyzer evaluates
				// the type of Object.values(dstAccount.vpcs) to be `any`. So we bounce
				// through the key lookup instead.
				const targetVpc = targetAccount.vpcs[targetVpcId];
				const targetCidrs: string[] = [];
				for (const dstAccount of phase1Result) {
					for (const dstVpcId of Object.keys(dstAccount.vpcs)) {
						const dstVpc = dstAccount.vpcs[dstVpcId];
						if (dstVpc === targetVpc) continue;
						targetCidrs.concat(dstVpc.cidrs);
					}
				}
				switch (targetAccount.type) {
					case AccountType.AwsAccount: {
						if (targetVpc.vpc.type !== "AwsVpc") {
							throw new Error("Unexpected non-AWS VPCs inside AWS Account.");
						}
						awsMakeSecurityGroup(
							undefined, // pending multiaccount support
							targetVpc.vpc,
							{ ...targetVpc.vpc.tags }, // Pending more complete tags
							targetCidrs,
						);
						break;
					}
					case AccountType.AzureAccount: {
						if (targetVpc.vpc.type !== "AzureVpc") {
							throw new Error("Unexpected non-AWS VPCs inside AWS Account.");
						}
						azureMakeSecurityGroup(
							undefined,
							targetVpc.vpc,
							{ ...targetVpc.vpc.tags },
							targetCidrs,
						);
						break;
					}
					case AccountType.GcpAccount: {
						if (targetVpc.vpc.type !== "GcpVpc") {
							throw new Error("Unexpected non-AWS VPCs inside AWS Account.");
						}
						gcpMakeFirewallPolicy(undefined, targetVpc.vpc, targetCidrs);
						break;
					}
					default: {
						targetAccount satisfies never;
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

export function planMesh(
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
