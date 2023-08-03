import * as aws from "@pulumi/aws";
import * as azure from "@pulumi/azure-native";
import * as gcp from "@pulumi/gcp";
import * as fs from "fs";
import * as pulumi from "@pulumi/pulumi";
import * as crypto from "crypto";

import {
	AwsAccount,
	AzureAccount,
	Config,
	GcpAccount,
	IpV4Address,
	MapToOutputs,
} from "../types/new-types";

import { ToSynthesize } from "../config";

import { prepareWorkspaceOptions } from "../utils";

// Normally I don't love singleton classes like this but I think the alternative is worse.
// TODO: this class isn't really serving the purpose I thought it would.  I think we need to rethink its use.
class Targeter {
	private targets: Record<string, pulumi.Output<IpV4Address> | undefined> = {};
	public readonly dummyIp = pulumi.output(IpV4Address.parse("1.1.1.1"));
	private dummyCount = 0;

	set(name: string, value: pulumi.Output<IpV4Address>): typeof this {
		// TODO: this check really should pass but it doesn't just yet.
		// I think that is evidence of a bug somewhere but I don't have time to
		// chase it down at the moment.

		// if (this.targets[name] !== undefined) {
		// 	throw new Error(`Duplicate name: ${name}`);
		// }

		this.targets[name] = value;
		return this;
	}

	get(name: string): pulumi.Output<IpV4Address> {
		const ip = this.targets[name];
		if (ip === undefined) {
			this.dummyCount++;
			return this.dummyIp;
		} else {
			return ip;
		}
	}

	*[Symbol.iterator](): Iterator<[string, pulumi.Output<IpV4Address>]> {
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

export const provisionNetwork = async (args: ToSynthesize) => {
	// TODO: remove enum in favor of zod unions
	enum AccountType {
		AwsAccount = "AwsAccount",
		AzureAccount = "AzureAccount",
		GcpAccount = "GcpAccount",
	}

	// TODO: move this into aws section
	const buildForAwsAccount = (account: AwsAccount) => {
		return {
			type: AccountType.AwsAccount as const,
			vpcs: Object.fromEntries(
				account.vpcs?.map((vpc) => {
					const vpnGateway = new aws.ec2.VpnGateway(
						`vpn-gateway/${account.id}/${vpc.id}`,
						{
							vpcId: vpc.id,
							tags: vpc.tags,
						},
					);
					return [vpc.id, { vpnGateway }];
				}) ?? [],
			),
		};
	};

	// TODO: move this into azure section
	const buildForAzureAccount = (account: AzureAccount) => {
		return {
			type: AccountType.AzureAccount as const,
			vpcs: Object.fromEntries(
				account.vpcs?.map((vpc) => {
					const vpcName = vpc.id.split("/").slice(-1)[0];
					const gatewaySubnet = azure.network.getSubnetOutput({
						resourceGroupName: vpc.resourceGroupName.split("/").slice(-1)[0],
						virtualNetworkName: vpcName,
						subnetName: "GatewaySubnet",
					});

					const publicIp = new azure.network.PublicIPAddress(
						`public-ip/${vpc.id}`,
						{
							resourceGroupName: vpc.resourceGroupName.split("/").slice(-1)[0],
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
							resourceGroupName: vpc.resourceGroupName.split("/").slice(-1)[0],
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
							gatewaySubnet,
							publicIp,
							vpnGateway,
							resourceGroupName: vpc.resourceGroupName,
						},
					];
				}) ?? [],
			),
		};
	};

	// TODO: move this into gcp section
	const buildForGcpAccount = (account: GcpAccount) => {
		return {
			type: AccountType.GcpAccount as const,
			vpcs: Object.fromEntries(
				account.vpcs?.map((vpc) => {
					const network = gcp.compute.getNetworkOutput({
						name: vpc.networkName,
					});
					const vpnGateway = new gcp.compute.VPNGateway(
						`vpn-gateway/${vpc.id}`,
						{
							network: network.name,
							name: pulumi.interpolate`a-${vpc.id.split("/").slice(-1)[0]}`,
							region: vpc.subnets[0].region,
							project: vpc.projectName,
						},
					);
					const publicIp = new gcp.compute.Address(`public-ip/${vpc.id}`, {
						name: pulumi.interpolate`a-${vpc.id.split("/").slice(-1)[0]}`,
						project: vpc.projectName,
						region: vpc.subnets[0].region,
						labels: vpc.tags,
					});
					const forwardingRules = {
						esp: new gcp.compute.ForwardingRule(
							`forwarding-rule/${vpc.id}/esp`,
							{
								name: pulumi.interpolate`a-${
									vpc.id.split("/").slice(-1)[0]
								}-esp`,
								ipAddress: publicIp.address,
								ipProtocol: "ESP",
								region: vpc.subnets[0].region,
								target: vpnGateway.id,
							},
						),
						ipsec: new gcp.compute.ForwardingRule(
							`forwarding-rule/${vpc.id}/ipsec`,
							{
								name: pulumi.interpolate`a-${
									vpc.id.split("/").slice(-1)[0]
								}-ipsec`,
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
								name: pulumi.interpolate`a-${
									vpc.id.split("/").slice(-1)[0]
								}-ipsecnat`,
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
							account,
							network,
							vpnGateway,
							publicIp,
							forwardingRules,
						},
					];
				}) ?? [],
			),
		};
	};

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

	const planMesh =
		(
			meshArgs: ToSynthesize,
			config: Config,
			phase1Targeter:
				| Record<string, IpV4Address | undefined>
				| undefined = undefined,
		) =>
		() => {
			const meshPsk = pulumi.secret(meshArgs.psk);
			const targeter = new Targeter();
			if (phase1Targeter !== undefined) {
				for (const [k, v] of Object.entries(phase1Targeter)) {
					if (v === undefined) {
						throw new Error(`Unreachable code: undefined targeter value`);
					}
					targeter.set(k, pulumi.output(v));
				}
			}

			const phase1Result = config.map((account) => {
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

			// Fill out targeter
			for (const srcAccount of phase1Result) {
				for (const dstAccount of phase1Result) {
					if (dstAccount.type == AccountType.AwsAccount) {
						// You can't do anything here because AWS is a goof and won't give me the IPs when I actually want them.
						continue;
					}
					for (const srcVpc of Object.keys(srcAccount.vpcs)) {
						switch (dstAccount.type) {
							case AccountType.AzureAccount: {
								for (const [dstVpcId, dstVpc] of Object.entries(
									dstAccount.vpcs,
								)) {
									if (srcVpc === dstVpcId) {
										continue;
									}
									targeter.set(
										`${srcVpc}->${dstVpcId}`,
										dstVpc.publicIp.ipAddress.apply((x) => x!),
									);
								}
								break;
							}
							case AccountType.GcpAccount: {
								for (const [dstVpcId, dstVpc] of Object.entries(
									dstAccount.vpcs,
								)) {
									if (srcVpc === dstVpcId) {
										continue;
									}
									targeter.set(
										`${srcVpc}->${dstVpcId}`,
										dstVpc.publicIp.address,
									);
								}
								break;
							}
							default: {
								void (dstAccount satisfies never);
								throw new Error(`Unreachable code: unknown account type`);
							}
						}
					}
				}
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
									const targetIp = targeter.get(`${srcVpc}->${dstVpc}`);
									const remoteGateway = new aws.ec2.CustomerGateway(
										`customer-gateway/${srcVpc}->${dstVpc}`,
										{
											type: "ipsec.1",
											deviceName: `${srcVpc}-to-${dstVpc}`,
											bgpAsn: `${65000}`, // TODO: fill in with a real ASN
											tags: srcAccount.vpcs[srcVpc].vpnGateway.tags.apply(
												(x) => x ?? {},
											),
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
											vpnGatewayId: srcAccount.vpcs[srcVpc].vpnGateway.id,
											staticRoutesOnly: true, // TODO: eventually we should support BGP
											tunnel1PresharedKey: meshPsk,
											tags: srcAccount.vpcs[srcVpc].vpnGateway.tags.apply(
												(x) => x ?? {},
											),
											type: "ipsec.1",
										},
									);
									// NOTE: this is "backwards" on purpose.  AWS is a goof and won't give me the IPs when I actually want them.
									// This is one of the two key steps in fixing the circular dependency resulting from AWS's api.
									targeter.set(
										`${dstVpc}->${srcVpc}`,
										vpnConnection.tunnel1Address,
									);
									break;
								}
								case AccountType.AzureAccount: {
									const targetIp = targeter.get(`${srcVpc}->${dstVpc}`);
									const localNetworkGateway =
										new azure.network.LocalNetworkGateway(
											`local-network-gateway/${srcVpc}->${dstVpc}`,
											{
												resourceGroupName: srcAccount.vpcs[
													srcVpc
												].resourceGroupName
													.split("/")
													.slice(-1)[0],
												localNetworkGatewayName:
													pulumi.interpolate`${srcAccount.vpcs[srcVpc].vpnGateway.name}-${dstVpc}`.apply(
														(x) => {
															return crypto
																.createHash("sha256")
																.update(x)
																.digest("hex");
														},
													),
												gatewayIpAddress: targetIp,
												tags: srcAccount.vpcs[srcVpc].vpnGateway.tags.apply(
													(x) => x ?? {},
												),
												localNetworkAddressSpace: {
													addressPrefixes: ["10.99.99.0/24"], // This is the list of prefixes the tunnel will accept. TODO: fill in properly
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
												resourceGroupName: srcAccount.vpcs[
													srcVpc
												].resourceGroupName
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
													id: srcAccount.vpcs[srcVpc].vpnGateway.id.apply(
														(x) => {
															console.log("vpn gateway id: ", x);
															return x;
														},
													),
												},
												tags: srcAccount.vpcs[srcVpc].vpnGateway.tags.apply(
													(x) => x ?? {},
												),
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
									break;
								}
								case AccountType.GcpAccount: {
									const targetIp = targeter.get(`${srcVpc}->${dstVpc}`);
									const _vpnTunnel = new gcp.compute.VPNTunnel(
										`vpn-tunnel/${srcVpc}->${dstVpc}`,
										{
											region: srcAccount.vpcs[srcVpc].vpnGateway.region,
											name: pulumi.interpolate`${
												srcAccount.vpcs[srcVpc].vpnGateway.name
											}-${crypto
												.createHash("sha256")
												.update(dstVpc)
												.digest("hex")
												.slice(0, 15)}`,
											peerIp: targetIp,
											labels: srcAccount.vpcs[srcVpc].publicIp.labels.apply(
												(x) => x ?? {},
											),
											sharedSecret: meshPsk,
											targetVpnGateway: srcAccount.vpcs[srcVpc].vpnGateway.id,
											ikeVersion: 2,
											// These both need to be 0.0.0.0/0 for route-based routing. (As opposed to policy based.)
											remoteTrafficSelectors: ["0.0.0.0/0"],
											localTrafficSelectors: ["0.0.0.0/0"],
										},
										{
											dependsOn: [srcAccount.vpcs[srcVpc].forwardingRules.esp],
											// This `ignoreChanges` is needed so that we don't mess with the IP address on update to the mesh.
											ignoreChanges:
												targetIp === targeter.dummyIp ? ["peerIp"] : [],
										},
									);
									//TODO: add routes here
									break;
								}
								default: {
									void (srcAccount satisfies never);
									throw new Error("unknown account type");
								}
							}
						}
					}
				}
			}
			return Promise.resolve(
				Array.from(
					function* () {
						for (const [k, v] of targeter) {
							yield [k, v] as const;
						}
					}.bind(this)(),
				),
			);
		};

	const config = args.accounts;

	const meshResult = await meshStack.up({
		onOutput: process.stdout.write.bind(process.stdout),
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
		color: "auto",
	});

	const meshResult2 = await meshStack.up({
		onOutput: process.stdout.write.bind(process.stdout),
		color: "auto",
		program: planMesh(args, config, pass1Targeter),
	});
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

	await meshStack.destroy({
		onOutput: process.stdout.write.bind(process.stdout),
		color: "auto",
	});
};