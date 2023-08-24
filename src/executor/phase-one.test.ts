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
			case "azure:network/virtualNetworkGateway:VirtualNetworkGateway":
				return {
					id: "sg-87654321",
					state: {
						...args.inputs,
						id: "sg-87654321",
						name: args.inputs.name || args.name,
					},
				};
			case "gcp:compute/vpnGateway:VPNGateway":
				return {
					id: "sg-55555555",
					state: {
						...args.inputs,
						id: "sg-55555555",
					},
				};
			case "azure:network/publicIpAddress:PublicIpAddress":
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
				id: "unknown", //args.inputs.name + "_id",
				state: args.inputs,
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
			case "azure:network/getSubnetOutput:getSubnetOutput":
				return {
					id: "subnet-1234-abcd-5678-90ef",
					...args.inputs
				};
			case "gcp:compute/getNetworkOutput:getNetworkOutput":
				return {
					id: "network-5678-1234-abcd-90ef",
					...args.inputs
				};
			default:
                return args.inputs;
        }
    },
},
  "project",
  "stack",
  /* preview = */ false,
);

import * as aws from "@pulumi/aws";
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

	const awsPhaseOneVpc1: AwsPhaseOneVpc = {
		type: VpcType.AwsVpc,
		resource: null,
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

	const awsVpc1Resources = //: AwsPhaseOneResource =
	{
		vpnGateway: {
			id: pulumi.output("sg-111111-1"),
			vpcId: pulumi.output("vpc-12345678"),
			tags: pulumi.output({
				"managed-by": "chasm",
			}),
		},
	};

	const awsPhaseOneVpc2: AwsPhaseOneVpc = {
		type: VpcType.AwsVpc,
		resource: null,
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

	const awsVpc2Resources = //: AwsPhaseOneResource =
	{
		vpnGateway: {
			id: pulumi.output("sg-111111-2"),
			vpcId: pulumi.output("vpc-87654321"),
			tags: pulumi.output({
				"managed-by": "chasm",
			}),
		},
	};

	const gcpPhaseOneVpc: GcpPhaseOneVpc = {
		type: VpcType.GcpVpc,
		resource: null,
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

	const gcpVpcResources = //: GcpPhaseOneResource =
	{
		network: pulumi.output({
			id: "network-5678-1234-abcd-90ef",
			name: "my-project-vpc",
		}),
		vpnGateway: {
			id: pulumi.output("sg-55555555"),
			region: pulumi.output("us-west4"),
			name: pulumi.output("a-12345678901234567"),
		},
		publicIp: {
			id: pulumi.output("sg-66666666"),
			address: pulumi.output("172.16.129.1"),
			labels: pulumi.output({
				"managed-by": "chasm",
			}),
		},
		forwardingRules: {
			esp: {
				id: pulumi.output("forwarding-rule-1"),
				name: pulumi.output("a-12345678901234567-esp"),
				ipAddress: pulumi.output("172.16.129.1"),
				ipProtocol: pulumi.output("ESP"),
				region: pulumi.output("us-west4"),
				target: pulumi.output("sg-55555555"),
			},
			ipsec: {
				id: pulumi.output("forwarding-rule-2"),
				name: pulumi.output("a-12345678901234567-ipsec"),
				ipAddress: pulumi.output("172.16.129.1"),
				ipProtocol: pulumi.output("UDP"),
				region: pulumi.output("us-west4"),
				portRange: pulumi.output("500"),
				target: pulumi.output("sg-55555555"),
			},
			ipsecNat: {
				id: pulumi.output("forwarding-rule-3"),
				name: pulumi.output("a-12345678901234567-ipsecnat"),
				ipAddress: pulumi.output("172.16.129.1"),
				ipProtocol: pulumi.output("UDP"),
				region: pulumi.output("us-west4"),
				portRange: pulumi.output("4500"),
				target: pulumi.output("sg-55555555"),
			},
		},
	};

	const azurePhaseOneVpc: AzurePhaseOneVpc = {
		type: VpcType.AzureVpc,
		resource: null,
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

	const azureVpcResources = //: AzurePhaseOneResource =
	{
		gatewaySubnet: pulumi.output({
			id: "subnet-1234-abcd-5678-90ef",
		}),
		publicIp: {
			id: pulumi.output("sg-22222222"),
			ipAddress: pulumi.output("10.0.2.2"),
		},
		vpnGateway: {
			id: pulumi.output("sg-87654321"),
			name: pulumi.output("vpn-gateway//subscriptions/12345678-9abc-def0-1234-56789abcdef0/resourceGroups/test-resource-rg/providers/Microsoft.Network/virtualNetworks/test-resource-rg-vnet-12345678"),
			tags: pulumi.output({
				"managed-by": "chasm",
			}),
		},
	};

	const expectedPhaseOneAccounts: Array<PhaseOneAccount> = [
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

	beforeEach(() => {});

	it("buildPhase1Result builds expected PhaseOneAccount", () => {
		const result = buildPhase1Result(config, /* mockup = */ true);
		expect(result).toMatchObject(expectedPhaseOneAccounts);
	});

	const vpnGateway = new aws.ec2.VpnGateway(
		`vpn-gateway/abc123`,
		{
			vpcId: "id-something",
			tags: {
				"a": "aa",
				"b": "bb"
			},
		},
	);

	it("vpnGateway", () => {
		pulumi.all([vpnGateway.tags, vpnGateway.id]).apply(([tags, id]) => {
			expect(isPresent(tags?.a)).toBeTruthy();
			expect(isPresent(tags?.b)).toBeTruthy();
			expect(isPresent(tags?.c)).toBeFalsy();
			expect(id).toBe("sg-12345678");
		});
	});
});
