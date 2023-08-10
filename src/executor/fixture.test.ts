import { Targeter, planMesh } from "./fixture";

import { IpV4Address } from "../types/new-types";
import { ToSynthesize } from "../config";

describe("Targeter", () => {
    let targeter: Targeter<IpV4Address>;
    let emptyTargeter: Targeter<IpV4Address>;

    function iterationToSet(tt: Targeter<IpV4Address>) : Set<[string, IpV4Address]> {
        const ss : Set<[string, IpV4Address]> = new Set();
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
        const actualSet : Set<[string, IpV4Address]> = iterationToSet(targeter);
        expect(actualSet).toEqual(expectedSet);
	});

    it("iterating an empty targeter", () => {
        const expectedSet : Set<[string, IpV4Address]> = new Set();
        const actualSet : Set<[string, IpV4Address]> = iterationToSet(emptyTargeter);
        expect(actualSet).toEqual(expectedSet);
	});

    it("modifying a targeter", () => {
        const expectedSet = new Set<[string, IpV4Address]>([
            ["aaaa", IpV4Address.parse("12.13.14.15")],
            ["bbbb", IpV4Address.parse("16.17.18.19")],
            ["cccc", IpV4Address.parse("21.22.23.24")],
        ]);
        let actualSet : Set<[string, IpV4Address]> = iterationToSet(targeter);
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

describe("Provision", () => {
    // const meshStack : pulumi.automation.Stack;

    beforeEach(() => {
        // meshStack = await pulumi.automation.LocalWorkspace.createOrSelectStack(
        //     {
        //         stackName: "test-network",
        //         workDir: "./mount/stack"
        //     }, {
        //         workDir: "./mount/stack"
        //     });
    });

    it("planMesh", async () => {
        const accounts = [
            {
                type: "AwsAccount",
                id: "test-id-aws1",
                region: "us-east-1",
                vpcs: [
                    {
                        id: "vpc-12345678",
                        tags: {
                            "managed-by": "chasm",
                        },
                        type: "AwsVpc",
                        region: "us-east-1",
                        cidr: "172.20.0.0/16",
                        subnets: [
                            {
                                id: "subnet-00000001",
                                cidr: "172.20.16.0/20",
                                type: "AwsSubnet"
                            },
                            {
                                id: "subnet-00000002",
                                cidr: "172.20.32.0/20",
                                type: "AwsSubnet"
                            }
                        ]
                    }
                ]
            },
            {
                type: "GcpAccount",
                id: "test-id-gcp1",
                project: "making-things-up",
                vpcs: [
                    {
                        id: "fedcba987654321012",
                        tags: {
                            "managed-by": "chasm",
                        },
                        type: "GcpVpc",
                        projectName: "making-things-up",
                        networkName: "mtu-dev01-vpc",
                        subnets: [
                            {
                                id: "0000000000000000111",
                                cidr: "172.10.16.0/24",
                                type: "GcpSubnet",
                                region: "us-west4"
                            }
                        ]
                    }
                ]
            },
            {
                type: "AzureAccount",
                id: "test-id-az1",
                subscriptionId: "12345678-9abc-def0-1234-56789abcdef",
                vpcs: [
                    {
                        id: "/subscriptions/12345678-9abc-def0-1234-56789abcdef/resourceGroups/test0/providers/Microsoft.Network/virtualNetworks/test0-vnet-000100002",
                        tags: {
                            "managed-by": "chasm",
                        },
                        type: "AzureVpc",
                        region: "southcentralus",
                        resourceGroupName: "/subscriptions/12345678-9abc-def0-1234-56789abcdef/resourceGroups/test0",
                        subnets: [
                            {
                                id: "/subscriptions/12345678-9abc-def0-1234-56789abcdef/resourceGroups/test0/providers/Microsoft.Network/virtualNetworks/test0-vnet-000100002/subnets/test0-subnet-1",
                                cidr: "15.0.1.0/24",
                                type: "AzureSubnet"
                            }
                        ]
                    }
                ]
            },
        ];
        const args = ToSynthesize.parse({
            meshName: "test-network",
            accounts,
            psk: "Fake PSK",
            projectName: "test-network",
            workDir: "./mount/mesh-workdir",
            pulumiLogFile: "./mount/mesh-workdir/pulumi-logs.out",
        });
        const foo = planMesh(args, args.accounts);
        for (const item of await foo()) {
        console.log(`item = ${item[0]} and ${JSON.stringify(item[1])}`);
        }
        expect(2+2).toBe(4);
    });
});