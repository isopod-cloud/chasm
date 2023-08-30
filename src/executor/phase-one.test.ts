import * as pulumi from "@pulumi/pulumi";

let awsCounter = 0;
let forwardingCounter = 0;

pulumi.runtime.setMocks({
    newResource: function(args: pulumi.runtime.MockResourceArgs): {id: string, state: any} {
		switch (args.type) {
            case "aws:ec2/vpnGateway:VpnGateway":
				awsCounter++;
                return {
                    id: `sg-111111-${awsCounter}`,
                    state: {
                        ...args.inputs,
                        id: `sg-111111-${awsCounter}`,
                        name: args.name + "-sg", //args.inputs.name || args.name + "-sg",
                    },
                };
			case "azure-native:network:VirtualNetworkGateway":
				return {
					id: "sg-87654321",
					state: {
						...args.inputs,
						id: "sg-87654321",
						name: args.inputs.name || args.name,
					},
				};
			case "gcp:compute/vPNGateway:VPNGateway":
				return {
					id: "sg-55555555",
					state: {
						...args.inputs,
						id: "sg-55555555",
						name: args.inputs.name || args.name,
					},
				};
			case "azure-native:network:PublicIPAddress":
				return {
					id: "sg-22222222",
					state: {
						...args.inputs,
						id: "sg-22222222",
						ipAddress: "10.0.2.2",
					},
				};
			case "gcp:compute/address:Address":
				return {
					id: "sg-66666666",
					state: {
						...args.inputs,
						id: "sg-66666666",
						labels: args.inputs.tags,
						address: "172.16.129.1",
					},
				};
			case "gcp:compute/forwardingRule:ForwardingRule":
				forwardingCounter++;
				return {
					id: `forwarding-rule-${forwardingCounter}`,
					state: {
						...args.inputs,
						id: `forwarding-rule-${forwardingCounter}`,
					},
				};
		default:
			return {
				id: `unknown-resource-${args.type}`,
				state: {
					// NOTE: id is chosen to make it easy to debug problems
					id: `unknown-resource-${args.type}`,
					...args.inputs,
				},
			};
		}
    },
    call: function(args: pulumi.runtime.MockCallArgs) {
        switch (args.token) {
            case "aws:ec2/getAmi:getAmi":
                return {
                    "architecture": "x86_64",
                    "id": "ami-0eb1f3cdeeb8eed2a",
                };
			case "azure-native:network:getSubnet":
				return {
					id: "subnet-1234-abcd-5678-90ef",

					etag: "",
					ipConfigurationProfiles: [],
					ipConfigurations: [],
					privateEndpoints: [],
					provisioningState: "ready",
					purpose: "",
					resourceNavigationLinks: [],
					serviceAssociationLinks: [],
		
					...args.inputs
				};
			case "gcp:compute/getNetwork:getNetwork":
				return {
					id: "network-5678-1234-abcd-90ef",

					// 
					description: "",
					gatewayIpv4: "172.16.129.10",
					selfLink: "",
					subnetworksSelfLinks: [],

					...args.inputs
				};
			default:
                return {
					// NOTE: id is chosen to make it easy to debug problems
					id: `undefined-call-${args.token}`,
					...args.inputs
				};
        }
    },
},
  "project",
  "stack",
  /* preview = */ false,
);

// Convert a pulumi.Output to a promise of the same type.
function promiseOf<T>(output: pulumi.Output<T>): Promise<T> {
    return new Promise(resolve => output.apply(resolve));
}

import * as aws from "@pulumi/aws";
import * as azure from "@pulumi/azure-native";
import * as gcp from "@pulumi/gcp";
import { AwsVpc, Config, GcpSubnet, GcpVpc } from "../types/new-types";
import {
	AccountType,
	VpcType,
	AwsPhaseOneVpc,
	AzurePhaseOneVpc,
	GcpPhaseOneVpc,
	PhaseOneAccount,
	buildPhase1Result,
	GcpPhaseOneResource,
	AzurePhaseOneResource,
	AwsPhaseOneResource,
} from "./phase-one";
import { isPresent } from "../utils";

// NOTE: There are other attributes in the pulumi aws objects, but these unwrapped ones are the
// ones we care about for plan-mesh
interface AwsVpnGatewayUnwrapped {
	id: string;
	vpcId: string;
	tags: Record<string, string> | undefined;
}

interface AwsPhaseOneResourceUnwrapped {
	vpnGateway: AwsVpnGatewayUnwrapped;
}

function outputOnOutsideAws(resource: AwsPhaseOneResource): pulumi.Output<AwsPhaseOneResourceUnwrapped> {
	return pulumi.all([resource.vpnGateway.id, resource.vpnGateway.vpcId, resource.vpnGateway.tags]).apply(([
		id, vpcId, tags
	]) => {
		return pulumi.output({
			vpnGateway: {
				id,
				vpcId,
				tags
			},
		});
	});
}

// NOTE: There are other attributes in the pulumi gcp objects, but these unwrapped ones are the
// ones we care about for plan-mesh
//
// NOTE: The "or undefined" in the member types below are imposed by pulumi gcp forwarding rules at
// build-time. In truth, only portRange is optional, all other attributes should always be present.
interface GcpForwaringRuleUnwrapped {
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

interface GcpForwardingRulesUnwrapped {
	esp: GcpForwaringRuleUnwrapped;
	ipsec: GcpForwaringRuleUnwrapped;
	ipsecNat: GcpForwaringRuleUnwrapped;
}

interface GcpVpnGatewayUnwrapped {
	id: string;
	region: string;
	name: string;
}

interface GcpPublicIpUnwrapped {
	id: string;

	// TODO: After unwrapping ipAddress from the pulumi gcp object, we get a string, but we can
	// decide if it is helpful to convert this to a formal IpV4Address object
	address: string;

	labels: Record<string, string> | undefined;
}

interface GcpPhaseOneResourceUnwrapped {
	network: gcp.compute.GetNetworkResult;
	vpnGateway: GcpVpnGatewayUnwrapped;
	publicIp: GcpPublicIpUnwrapped;
	forwardingRules: GcpForwardingRulesUnwrapped;
}

function outputOnOutsideGcp(resource: GcpPhaseOneResource): pulumi.Output<GcpPhaseOneResourceUnwrapped> {
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

	return pulumi.all([
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
	});
}

// NOTE: There are other attributes in the pulumi azure objects, but these unwrapped ones are the
// ones we care about for plan-mesh
interface AzurePublicIpUnwrapped {

	id: string;

	// TODO: After unwrapping ipAddress from the pulumi azure object, if it's not undefined, then
	// we get a string, but we can decide if it is helpful to convert this to a formal IpV4Address
	// object
	ipAddress: string | undefined;

}

interface AzureVpnGatewayUnwrapped {
	id: string;
	name: string;
	tags: Record<string, string> | undefined;
}

interface AzurePhaseOneResourceUnwrapped {
	gatewaySubnet: azure.network.GetSubnetResult;
	publicIp: AzurePublicIpUnwrapped;
	vpnGateway: AzureVpnGatewayUnwrapped;
}

function outputOnOutsideAzure(resource: AzurePhaseOneResource): pulumi.Output<AzurePhaseOneResourceUnwrapped> {
	return pulumi.all([
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
	});
}

type PhaseOneResourceUnwrapped = AwsPhaseOneResourceUnwrapped | AzurePhaseOneResourceUnwrapped | GcpPhaseOneResourceUnwrapped;

async function accountsToSimplifiedResourceMap(accounts: PhaseOneAccount[]): Promise<Record<string, PhaseOneResourceUnwrapped>> {
	const records: Record<string, PhaseOneResourceUnwrapped> = {};
	for (const account of accounts) {
		for (const vpcId in account.vpcs) {
			switch (account.type) {
				case AccountType.AwsAccount: {
					records[vpcId] = await promiseOf(outputOnOutsideAws(account.vpcs[vpcId].resource!));

					// const item = outputOnOutsideAws(account.vpcs[vpcId].resource!);
					// const promise = await promiseOf(item);
					// records[vpcId] = promise;
					break;
				}
				case AccountType.AzureAccount: {
					records[vpcId] = await promiseOf(outputOnOutsideAzure(account.vpcs[vpcId].resource!));
					// const item = outputOnOutsideAzure(account.vpcs[vpcId].resource!);
					// const promise = await promiseOf(item);
					// records[vpcId] = promise;
					break;
				}
				case AccountType.GcpAccount: {
					records[vpcId] = await promiseOf(outputOnOutsideGcp(account.vpcs[vpcId].resource!));

					// const item = outputOnOutsideGcp(account.vpcs[vpcId].resource!);
					// const promise = await promiseOf(item);
					// records[vpcId] = promise;
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

describe("PhaseOneAccount", () => {
	const config: Config = [
		{
			type: "AwsAccount",
			id: "arbitrary-unique-id-aws1",
			region: "us-east-1",
			vpcs: [
				{
					id: "vpc-12345678",
					tags: {
						"managed-by": "chasm",
					},
					type: "AwsVpc",
					region: "us-east-1",
					cidr: "172.1.0.0/16",
					subnets: [
						{
							id: "subnet-00000001",
							cidr: "172.1.1.0/24",
							type: "AwsSubnet",
						},
						{
							id: "subnet-00000002",
							cidr: "172.1.2.0/24",
							type: "AwsSubnet",
						},
						{
							id: "subnet-00000003",
							cidr: "172.1.3.0/24",
							type: "AwsSubnet",
						},
						{
							id: "subnet-00000004",
							cidr: "172.1.4.0/24",
							type: "AwsSubnet",
						},
						{
							id: "subnet-00000005",
							cidr: "172.1.5.0/24",
							type: "AwsSubnet",
						},
						{
							id: "subnet-00000006",
							cidr: "172.1.6.0/24",
							type: "AwsSubnet",
						},
					],
				},
				{
					id: "vpc-87654321",
					tags: {
						"managed-by": "chasm",
					},
					type: "AwsVpc",
					region: "us-east-1",
					cidr: "172.2.0.0/16",
					subnets: [
						{
							id: "subnet-00000011",
							cidr: "172.2.1.0/24",
							type: "AwsSubnet",
						},
						{
							id: "subnet-00000012",
							cidr: "172.2.2.0/24",
							type: "AwsSubnet",
						},
						{
							id: "subnet-00000013",
							cidr: "172.2.3.0/24",
							type: "AwsSubnet",
						},
					],
				},
			],
		},
		{
			type: "GcpAccount",
			id: "arbitrary-unique-id-gcp1",
			project: "my-project",
			vpcs: [
				{
					id: "12345678901234567",
					tags: {
						"managed-by": "chasm",
					},
					type: "GcpVpc",
					projectName: "my-project",
					networkName: "my-project-vpc",
					subnets: [
						{
							id: "1111111111111111111",
							cidr: "30.30.30.0/24",
							type: "GcpSubnet",
							region: "us-west4",
						},
					],
				},
			],
		},
		{
			type: "AzureAccount",
			id: "arbitrary-unique-id-az1",
			subscriptionId: "12345678-9abc-def0-1234-56789abcdef0",
			vpcs: [
				{
					id: "/subscriptions/12345678-9abc-def0-1234-56789abcdef0/resourceGroups/test-resource-rg/providers/Microsoft.Network/virtualNetworks/test-resource-rg-vnet-12345678",
					tags: {
						"managed-by": "chasm",
					},
					type: "AzureVpc",
					region: "southcentralus",
					resourceGroupName:
						"/subscriptions/12345678-9abc-def0-1234-56789abcdef0/resourceGroups/test-resource-rg",
					subnets: [
						{
							id: "/subscriptions/12345678-9abc-def0-1234-56789abcdef0/resourceGroups/test-resource-rg/providers/Microsoft.Network/virtualNetworks/test-resource-rg-vnet-12345678/subnets/test-resource-rg-subnet-1",
							cidr: "10.10.1.0/24",
							type: "AzureSubnet",
						},
						{
							id: "/subscriptions/12345678-9abc-def0-1234-56789abcdef0/resourceGroups/test-resource-rg/providers/Microsoft.Network/virtualNetworks/test-resource-rg-vnet-12345678/subnets/test-resource-rg-subnet-2",
							cidr: "10.10.2.0/24",
							type: "AzureSubnet",
						},
					],
				},
			],
		},
	];

	const awsPhaseOneVpc1 = {
		type: VpcType.AwsVpc,
		cidrs: [
			"172.1.1.0/24",
			"172.1.2.0/24",
			"172.1.3.0/24",
			"172.1.4.0/24",
			"172.1.5.0/24",
			"172.1.6.0/24",
		],
		subnets: [
			{
				id: "subnet-00000001",
				cidr: "172.1.1.0/24",
				type: "AwsSubnet",
			},
			{
				id: "subnet-00000002",
				cidr: "172.1.2.0/24",
				type: "AwsSubnet",
			},
			{
				id: "subnet-00000003",
				cidr: "172.1.3.0/24",
				type: "AwsSubnet",
			},
			{
				id: "subnet-00000004",
				cidr: "172.1.4.0/24",
				type: "AwsSubnet",
			},
			{
				id: "subnet-00000005",
				cidr: "172.1.5.0/24",
				type: "AwsSubnet",
			},
			{
				id: "subnet-00000006",
				cidr: "172.1.6.0/24",
				type: "AwsSubnet",
			},
		],
		vpc: AwsVpc.parse({
			id: "vpc-12345678",
			tags: {
				"managed-by": "chasm",
			},
			type: "AwsVpc",
			region: "us-east-1",
			cidr: "172.1.0.0/16",
			subnets: [
				{
					id: "subnet-00000001",
					cidr: "172.1.1.0/24",
					type: "AwsSubnet",
				},
				{
					id: "subnet-00000002",
					cidr: "172.1.2.0/24",
					type: "AwsSubnet",
				},
				{
					id: "subnet-00000003",
					cidr: "172.1.3.0/24",
					type: "AwsSubnet",
				},
				{
					id: "subnet-00000004",
					cidr: "172.1.4.0/24",
					type: "AwsSubnet",
				},
				{
					id: "subnet-00000005",
					cidr: "172.1.5.0/24",
					type: "AwsSubnet",
				},
				{
					id: "subnet-00000006",
					cidr: "172.1.6.0/24",
					type: "AwsSubnet",
				},
			],
		}),
	};

	const awsVpc1Resources: AwsPhaseOneResourceUnwrapped =
	{
		vpnGateway: {
			id: "sg-111111-1",
			vpcId: "vpc-12345678",
			tags: {
				"managed-by": "chasm",
			},
		},
	};

	const awsPhaseOneVpc2 = {
		type: VpcType.AwsVpc,
		cidrs: ["172.2.1.0/24", "172.2.2.0/24", "172.2.3.0/24"],
		subnets: [
			{
				id: "subnet-00000011",
				cidr: "172.2.1.0/24",
				type: "AwsSubnet",
			},
			{
				id: "subnet-00000012",
				cidr: "172.2.2.0/24",
				type: "AwsSubnet",
			},
			{
				id: "subnet-00000013",
				cidr: "172.2.3.0/24",
				type: "AwsSubnet",
			},
		],
		vpc: {
			id: "vpc-87654321",
			tags: {
				"managed-by": "chasm",
			},
			type: "AwsVpc",
			region: "us-east-1",
			cidr: "172.2.0.0/16",
			subnets: [
				{
					id: "subnet-00000011",
					cidr: "172.2.1.0/24",
					type: "AwsSubnet",
				},
				{
					id: "subnet-00000012",
					cidr: "172.2.2.0/24",
					type: "AwsSubnet",
				},
				{
					id: "subnet-00000013",
					cidr: "172.2.3.0/24",
					type: "AwsSubnet",
				},
			],
		},
	};

	const awsVpc2Resources: AwsPhaseOneResourceUnwrapped =
	{
		vpnGateway: {
			id: "sg-111111-2",
			vpcId: "vpc-87654321",
			tags: {
				"managed-by": "chasm",
			},
		},
	};

	const gcpPhaseOneVpc = {
		type: VpcType.GcpVpc,
		region: "us-west4",
		vpnName: "12345678901234567",
		cidrs: ["30.30.30.0/24"],
		subnets: [
			GcpSubnet.parse({
				id: "1111111111111111111",
				cidr: "30.30.30.0/24",
				type: "GcpSubnet",
				region: "us-west4",
			}),
		],
		vpc: GcpVpc.parse({
			id: "12345678901234567",
			tags: {
				"managed-by": "chasm",
			},
			type: "GcpVpc",
			projectName: "my-project",
			networkName: "my-project-vpc",
			subnets: [
				{
					id: "1111111111111111111",
					cidr: "30.30.30.0/24",
					type: "GcpSubnet",
					region: "us-west4",
				},
			],
		}),
	};

	const gcpVpcResources: GcpPhaseOneResourceUnwrapped =
	{
		network: {
			id: "network-5678-1234-abcd-90ef",
			name: "my-project-vpc",
			description: "",
			gatewayIpv4: "172.16.129.10",
			selfLink: "",
			subnetworksSelfLinks: []
		},
		vpnGateway: {
			id: "sg-55555555",
			region: "us-west4",
			name: "a-12345678901234567",
		},
		publicIp: {
			id: "sg-66666666",
			address: "172.16.129.1",
			labels: {
				"managed-by": "chasm",
			},
		},
		forwardingRules: {
			esp: {
				id: "forwarding-rule-1",
				name: "a-12345678901234567-esp",
				ipAddress: "172.16.129.1",
				ipProtocol: "ESP",
				region: "us-west4",
				target: "sg-55555555",
				portRange: undefined,
			},
			ipsec: {
				id: "forwarding-rule-2",
				name: "a-12345678901234567-ipsec",
				ipAddress: "172.16.129.1",
				ipProtocol: "UDP",
				region: "us-west4",
				portRange: "500",
				target: "sg-55555555",
			},
			ipsecNat: {
				id: "forwarding-rule-3",
				name: "a-12345678901234567-ipsecnat",
				ipAddress: "172.16.129.1",
				ipProtocol: "UDP",
				region: "us-west4",
				portRange: "4500",
				target: "sg-55555555",
			},
		},
	};

	const azurePhaseOneVpc = {
		type: VpcType.AzureVpc,
		vpcName: "test-resource-rg-vnet-12345678",
		resourceGroupNameTruncated: "test-resource-rg",
		resourceGroupName:
			"/subscriptions/12345678-9abc-def0-1234-56789abcdef0/resourceGroups/test-resource-rg",
		cidrs: ["10.10.1.0/24", "10.10.2.0/24"],
		subnets: [
			{
				id: "/subscriptions/12345678-9abc-def0-1234-56789abcdef0/resourceGroups/test-resource-rg/providers/Microsoft.Network/virtualNetworks/test-resource-rg-vnet-12345678/subnets/test-resource-rg-subnet-1",
				cidr: "10.10.1.0/24",
				type: "AzureSubnet",
			},
			{
				id: "/subscriptions/12345678-9abc-def0-1234-56789abcdef0/resourceGroups/test-resource-rg/providers/Microsoft.Network/virtualNetworks/test-resource-rg-vnet-12345678/subnets/test-resource-rg-subnet-2",
				cidr: "10.10.2.0/24",
				type: "AzureSubnet",
			},
		],
		vpc: {
			id: "/subscriptions/12345678-9abc-def0-1234-56789abcdef0/resourceGroups/test-resource-rg/providers/Microsoft.Network/virtualNetworks/test-resource-rg-vnet-12345678",
			tags: {
				"managed-by": "chasm",
			},
			type: "AzureVpc",
			region: "southcentralus",
			resourceGroupName:
				"/subscriptions/12345678-9abc-def0-1234-56789abcdef0/resourceGroups/test-resource-rg",
			subnets: [
				{
					id: "/subscriptions/12345678-9abc-def0-1234-56789abcdef0/resourceGroups/test-resource-rg/providers/Microsoft.Network/virtualNetworks/test-resource-rg-vnet-12345678/subnets/test-resource-rg-subnet-1",
					cidr: "10.10.1.0/24",
					type: "AzureSubnet",
				},
				{
					id: "/subscriptions/12345678-9abc-def0-1234-56789abcdef0/resourceGroups/test-resource-rg/providers/Microsoft.Network/virtualNetworks/test-resource-rg-vnet-12345678/subnets/test-resource-rg-subnet-2",
					cidr: "10.10.2.0/24",
					type: "AzureSubnet",
				},
			],
		},
	};

	const azureVpcResources: AzurePhaseOneResourceUnwrapped =
	{
		gatewaySubnet: {
			id: "subnet-1234-abcd-5678-90ef",
			etag: "",
			ipConfigurationProfiles: [],
			ipConfigurations: [],
			privateEndpoints: [],
			provisioningState: "ready",
			purpose: "",
			resourceNavigationLinks: [],
			serviceAssociationLinks: []
		},
		publicIp: {
			id: "sg-22222222",
			ipAddress: "10.0.2.2",
		},
		vpnGateway: {
			id: "sg-87654321",
			name: "vpn-gateway//subscriptions/12345678-9abc-def0-1234-56789abcdef0/resourceGroups/test-resource-rg/providers/Microsoft.Network/virtualNetworks/test-resource-rg-vnet-12345678",
			tags: {
				"managed-by": "chasm",
			},
		},
	};

	const expectedPhaseOneAccounts = [
		{
			type: AccountType.AwsAccount,
			mockup: true,
			vpcs: {
				"vpc-12345678": awsPhaseOneVpc1,
				"vpc-87654321": awsPhaseOneVpc2,
			},
		},
		{
			type: AccountType.GcpAccount,
			mockup: true,
			vpcs: {
				"12345678901234567": gcpPhaseOneVpc,
			},
		},

		{
			type: AccountType.AzureAccount,
			mockup: true,
			vpcs: {
				"/subscriptions/12345678-9abc-def0-1234-56789abcdef0/resourceGroups/test-resource-rg/providers/Microsoft.Network/virtualNetworks/test-resource-rg-vnet-12345678":
					azurePhaseOneVpc,
			},
		},
	];

	const expectedPhaseOneResources: Record<string, PhaseOneResourceUnwrapped> = {
		"vpc-12345678": awsVpc1Resources,
		"vpc-87654321": awsVpc2Resources,
		"12345678901234567": gcpVpcResources,
		"/subscriptions/12345678-9abc-def0-1234-56789abcdef0/resourceGroups/test-resource-rg/providers/Microsoft.Network/virtualNetworks/test-resource-rg-vnet-12345678": azureVpcResources,
	};

	beforeEach(() => {
		awsCounter = 0;
		forwardingCounter = 0;
	});

	it("buildPhase1Result builds expected PhaseOneAccount", () => {
		const result = buildPhase1Result(config, /* mockup = */ true);
		expect(result).toMatchObject(expectedPhaseOneAccounts);
	});

	it("buildPhase1Result builds expected cloud resources", async () => {
		const result = buildPhase1Result(config, /* mockup = */ false);
		const records = await accountsToSimplifiedResourceMap(result);

		// vpc id's found in records must match the expected ones exactly
		expect(JSON.stringify(Object.getOwnPropertyNames(records))).toBe(JSON.stringify(Object.getOwnPropertyNames(expectedPhaseOneResources)));

		// objects found in records should at least contain the attribute values we're expecting to see
		expect(records).toMatchObject(expectedPhaseOneResources);
	});
});
