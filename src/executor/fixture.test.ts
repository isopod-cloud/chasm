import {
	AccountType,
	AwsVpcInfoItem,
	AzureVpcInfoItem,
	GcpVpcInfoItem,
	Targeter,
	VpcInfo,
	buildPhase1Result,
} from "./fixture";

import {
	AwsVpc,
	Config,
	GcpSubnet,
	GcpVpc,
	IpV4Address,
} from "../types/new-types";

describe("Targeter", () => {
	let targeter: Targeter<IpV4Address>;
	let emptyTargeter: Targeter<IpV4Address>;

	function iterationToSet(
		tt: Targeter<IpV4Address>,
	): Set<[string, IpV4Address]> {
		const ss: Set<[string, IpV4Address]> = new Set();
		for (const [k, v] of tt) {
			ss.add([k, v]);
		}
		return ss;
	}

	beforeEach(() => {
		targeter = new Targeter<IpV4Address>(IpV4Address.parse("1.1.1.1"));
		targeter.set("aaaa", IpV4Address.parse("12.13.14.15"));
		targeter.set("bbbb", IpV4Address.parse("16.17.18.19"));
		targeter.set("cccc", IpV4Address.parse("21.22.23.24"));

		emptyTargeter = new Targeter<IpV4Address>(IpV4Address.parse("1.1.1.1"));
	});

	it("zero dummy count", () => {
		expect(targeter.countDummies()).toBe(0);
		targeter.get("aaaa");
		targeter.get("bbbb");
		targeter.get("cccc");
		expect(targeter.countDummies()).toBe(0);
	});

	it("nonzero dummy count", () => {
		expect(targeter.countDummies()).toBe(0);
		targeter.get("BBBB");
		targeter.get("bbbb");
		targeter.get("BbBb");
		expect(targeter.countDummies()).toBe(2);
	});

	it("nonzero dummy count on empty targeter", () => {
		expect(emptyTargeter.countDummies()).toBe(0);
		emptyTargeter.get("bbbb");
		expect(emptyTargeter.countDummies()).toBe(1);
	});

	it("get valid ip", () => {
		expect(targeter.get("bbbb")).toEqual(IpV4Address.parse("16.17.18.19"));
	});

	it("bad get yields dummy ip", () => {
		expect(targeter.get("dddd")).toEqual(IpV4Address.parse("1.1.1.1"));
	});

	it("set then get yields valid ip", () => {
		targeter.set("dddd", IpV4Address.parse("31.30.31.30"));
		expect(targeter.get("dddd")).toEqual(IpV4Address.parse("31.30.31.30"));
	});

	it("changing an existing ip", () => {
		expect(targeter.get("bbbb")).toEqual(IpV4Address.parse("16.17.18.19"));
		targeter.set("bbbb", IpV4Address.parse("31.30.31.30"));
		expect(targeter.get("bbbb")).toEqual(IpV4Address.parse("31.30.31.30"));
	});

	it("iterating a targeter", () => {
		const expectedSet = new Set<[string, IpV4Address]>([
			["aaaa", IpV4Address.parse("12.13.14.15")],
			["bbbb", IpV4Address.parse("16.17.18.19")],
			["cccc", IpV4Address.parse("21.22.23.24")],
		]);
		const actualSet: Set<[string, IpV4Address]> = iterationToSet(targeter);
		expect(actualSet).toEqual(expectedSet);
	});

	it("iterating an empty targeter", () => {
		const expectedSet: Set<[string, IpV4Address]> = new Set();
		const actualSet: Set<[string, IpV4Address]> = iterationToSet(emptyTargeter);
		expect(actualSet).toEqual(expectedSet);
	});

	it("modifying a targeter", () => {
		const expectedSet = new Set<[string, IpV4Address]>([
			["aaaa", IpV4Address.parse("12.13.14.15")],
			["bbbb", IpV4Address.parse("16.17.18.19")],
			["cccc", IpV4Address.parse("21.22.23.24")],
		]);
		let actualSet: Set<[string, IpV4Address]> = iterationToSet(targeter);
		expect(actualSet).toEqual(expectedSet);

		targeter.set("bbbb", IpV4Address.parse("31.30.31.30"));
		actualSet = iterationToSet(targeter);
		const expectedSet2 = new Set<[string, IpV4Address]>([
			["aaaa", IpV4Address.parse("12.13.14.15")],
			["bbbb", IpV4Address.parse("31.30.31.30")],
			["cccc", IpV4Address.parse("21.22.23.24")],
		]);
		expect(actualSet).toEqual(expectedSet2);

		targeter.set("dddd", IpV4Address.parse("42.43.43.42"));
		actualSet = iterationToSet(targeter);
		const expectedSet3 = new Set<[string, IpV4Address]>([
			["aaaa", IpV4Address.parse("12.13.14.15")],
			["bbbb", IpV4Address.parse("31.30.31.30")],
			["cccc", IpV4Address.parse("21.22.23.24")],
			["dddd", IpV4Address.parse("42.43.43.42")],
		]);
		expect(actualSet).toEqual(expectedSet3);
	});
});

describe("VpcInfo", () => {
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

	const awsVpcInfoItem1: AwsVpcInfoItem = {
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

	const awsVpcInfoItem2: AwsVpcInfoItem = {
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

	const gcpVpcInfoItem: GcpVpcInfoItem = {
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

	const azureVpcInfoItem: AzureVpcInfoItem = {
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

	const expectedVpcInfos: Array<VpcInfo> = [
		{
			type: AccountType.AwsAccount,
			mockup: true,
			vpcs: {
				"vpc-12345678": awsVpcInfoItem1,
				"vpc-87654321": awsVpcInfoItem2,
			},
		},
		{
			type: AccountType.GcpAccount,
			mockup: true,
			vpcs: {
				"12345678901234567": gcpVpcInfoItem,
			},
		},

		{
			type: AccountType.AzureAccount,
			mockup: true,
			vpcs: {
				"/subscriptions/12345678-9abc-def0-1234-56789abcdef0/resourceGroups/test-resource-rg/providers/Microsoft.Network/virtualNetworks/test-resource-rg-vnet-12345678":
					azureVpcInfoItem,
			},
		},
	];

	beforeEach(() => {});

	it("buildPhase1Result builds expected VpcInfo", () => {
		const result = buildPhase1Result(config, /* mockup = */ true);
		expect(result).toMatchObject(expectedVpcInfos);
	});
});
