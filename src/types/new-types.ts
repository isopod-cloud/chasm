import { z } from "zod";
import * as ipnum from "ip-num";
import { faker } from "@faker-js/faker";
import * as pulumi from "@pulumi/pulumi";

export const IpV4Address = z.string().ip({ version: "v4" });
export type IpV4Address = z.infer<typeof IpV4Address>;

export const IpV4MaskLength = z.coerce.number().int().min(0).max(32);
export type IpV4MaskLength = z.infer<typeof IpV4MaskLength>;

export const IpV4Cidr = z.string().superRefine((x, ctx) => {
	const split = x.split("/");
	if (split.length <= 1) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "IpV4Cidr must contain a '/'",
			path: [],
		});
	}
	if (split.length > 2) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "IpV4Cidr must contain only one '/'",
			path: [],
		});
	}
	if (split.length == 2) {
		const [ip, maskLen] = split;
		const ipSafeParse = IpV4Address.safeParse(ip);
		const safeParseSuccess = ipSafeParse.success;
		if (!safeParseSuccess) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `IpV4Cidr must contain a valid IPv4 address ("${ip}" not valid: ${JSON.stringify(
					ipSafeParse,
				)})`,
				path: [],
			});
		}
		const maskLenSafeParse = IpV4MaskLength.safeParse(maskLen);
		if (!maskLenSafeParse.success) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `IpV4Cidr must contain a valid mask length ("${maskLen}" not valid: ${JSON.stringify(
					maskLenSafeParse,
				)})`,
				path: [],
			});
		}
	}
});
export type IpV4Cidr = z.infer<typeof IpV4Cidr>;

export const Tags = z.record(z.string()).default({
	"managed-by": "chasm",
});
export type Tags = z.infer<typeof Tags>;

export const BaseSubnet = z.object({
	id: z.string().min(1),
	cidr: IpV4Cidr,
});
export type BaseSubnet = z.infer<typeof BaseSubnet>;

export const AwsSubnet = BaseSubnet.extend({
	type: z.literal("AwsSubnet"),
});
export type AwsSubnet = z.infer<typeof AwsSubnet>;

export const AzureSubnet = BaseSubnet.extend({
	type: z.literal("AzureSubnet"),
});
export type AzureSubnet = z.infer<typeof AzureSubnet>;

export const GcpSubnet = BaseSubnet.extend({
	type: z.literal("GcpSubnet"),
	region: z.string(),
});
export type GcpSubnet = z.infer<typeof GcpSubnet>;

export const Subnet = z.discriminatedUnion("type", [
	AwsSubnet,
	AzureSubnet,
	GcpSubnet,
]);
export type Subnet = z.infer<typeof Subnet>;

export const BaseVpc = z.object({
	id: z.string().min(1),
	tags: Tags,
});
export type BaseVpc = z.infer<typeof BaseVpc>;

export const AwsVpc = BaseVpc.extend({
	type: z.literal("AwsVpc"),
	region: z.string().min(1),
	subnets: z.array(AwsSubnet),
});
export type AwsVpc = z.infer<typeof AwsVpc>;

export const AzureVpc = BaseVpc.extend({
	type: z.literal("AzureVpc"),
	region: z.string().min(1),
	resourceGroupName: z.string().min(1),
	subnets: z.array(AzureSubnet),
});
export type AzureVpc = z.infer<typeof AzureVpc>;

export const GcpVpc = BaseVpc.extend({
	type: z.literal("GcpVpc"),
	projectName: z.string().min(1),
	networkName: z.string().min(1),
	subnets: z.array(GcpSubnet),
});
export type GcpVpc = z.infer<typeof GcpVpc>;

export const Vpc = z.discriminatedUnion("type", [AwsVpc, AzureVpc, GcpVpc]);
export type Vpc = z.infer<typeof Vpc>;

const BaseAccount = z.object({
	id: z.string().min(1),
});

export const AwsAccount = BaseAccount.extend({
	type: z.literal("AwsAccount"),
	region: z.string(),
	vpcs: z.array(AwsVpc).optional(),
});
export type AwsAccount = z.infer<typeof AwsAccount>;

export const AzureAccount = BaseAccount.extend({
	type: z.literal("AzureAccount"),
	subscriptionId: z.string(),
	vpcs: z.array(AzureVpc).optional(),
});
export type AzureAccount = z.infer<typeof AzureAccount>;

export const GcpAccount = BaseAccount.extend({
	type: z.literal("GcpAccount"),
	project: z.string(),
	vpcs: z.array(GcpVpc).optional(),
});
export type GcpAccount = z.infer<typeof GcpAccount>;

// eslint-disable-next-line @typescript-eslint/no-namespace

export const CloudAccount = z.discriminatedUnion("type", [
	AwsAccount,
	AzureAccount,
	GcpAccount,
]);
export type CloudAccount = z.infer<typeof CloudAccount>;

export const Config = z.array(CloudAccount);
export type Config = z.infer<typeof Config>;

export const Vpcs = z.object({
	aws: z.array(AwsVpc),
	azure: z.array(AzureVpc),
	gcp: z.array(GcpVpc),
});

export type Vpcs = z.infer<typeof Vpcs>;

// Take an ip space and split it into subnets of a given size
export const splitCidr = function* (
	cidr: string,
	networkBits: number,
): Generator<string, never, void> {
	const splitInto = ipnum.IPv4Prefix.fromNumber(BigInt(networkBits));
	const cidrSpace = ipnum.IPv4CidrRange.fromCidr(cidr);
	for (const cidr of cidrSpace.splitInto(splitInto)) {
		yield cidr.toCidrString();
	}
	throw new Error("no more subnets available in space provided");
}.bind(this);

const randomName = (maxLength: number = 22, maxAttempts: number = 1000) => {
	let count = 0;
	while (count < maxAttempts) {
		const words = faker.word.words(3).replace(/ /g, "-");
		if (words.length <= maxLength) {
			return words;
		}
		count++;
	}
	throw new Error(
		`Unable to generate a random name after ${maxAttempts} attempts`,
	);
};

export const uniqueNamespace = function* (): Generator<string, never, void> {
	const namesUsed = new Set<string>();
	while (true) {
		let name = randomName();
		while (namesUsed.has(name)) {
			name = randomName();
		}
		namesUsed.add(name);
		yield name;
	}
	// noinspection UnreachableCodeJS
	throw new Error("unreachable");
}.bind(this);

type Namespace = ReturnType<typeof uniqueNamespace>;

export const abstractSubspaceGenerator = function* (
	cidr: string,
	networkBits: number,
	namespace: Namespace,
): Generator<{ name: string; cidr: string }, never, void> {
	for (const subCidr of splitCidr(cidr, networkBits)) {
		yield {
			cidr: subCidr,
			name: namespace.next().value,
		};
	}
	throw new Error("no more subnets available in space provided");
}.bind(this);

// TODO: write a generator for this
const CloudName = z
	.string()
	.min(1)
	.max(22)
	.regex(/^[a-zA-Z][a-zA-Z0-9-]*$/);

export const ProtoAzureSubnet = z.object({
	type: z.literal("ProtoAzureSubnet"),
	name: CloudName,
	cidr: IpV4Cidr,
});
export type ProtoAzureSubnet = z.infer<typeof ProtoAzureSubnet>;

export const ProtoAzureVpc = z.object({
	type: z.literal("ProtoAzureVpc"),
	name: CloudName,
	resourceGroupName: CloudName,
	cidr: IpV4Cidr,
	region: CloudName,
	subnets: z.array(ProtoAzureSubnet),
});
export type ProtoAzureVpc = z.infer<typeof ProtoAzureVpc>;

export const ProtoAwsSubnet = z.object({
	type: z.literal("ProtoAwsSubnet"),
	name: CloudName,
	cidr: IpV4Cidr,
});
export type ProtoAwsSubnet = z.infer<typeof ProtoAwsSubnet>;

export const ProtoAwsVpc = z.object({
	type: z.literal("ProtoAwsVpc"),
	name: CloudName,
	cidr: IpV4Cidr,
	region: CloudName,
	subnets: z.array(ProtoAwsSubnet),
});
export type ProtoAwsVpc = z.infer<typeof ProtoAwsVpc>;

export const ProtoGcpSubnet = z.object({
	type: z.literal("ProtoGcpSubnet"),
	name: CloudName,
	region: CloudName,
	cidr: IpV4Cidr,
});
export type ProtoGcpSubnet = z.infer<typeof ProtoGcpSubnet>;

export const ProtoGcpVpc = z.object({
	type: z.literal("ProtoGcpVpc"),
	name: CloudName,
	cidr: IpV4Cidr,
	subnets: z.array(ProtoGcpSubnet),
	projectName: CloudName,
});
export type ProtoGcpVpc = z.infer<typeof ProtoGcpVpc>;

export type ProtoVpc = ProtoAzureVpc | ProtoAwsVpc | ProtoGcpVpc;
export const ProtoVpc = z.discriminatedUnion("type", [
	ProtoAzureVpc,
	ProtoAwsVpc,
	ProtoGcpVpc,
]);

export const azureVpcGenerator = function* (args: {
	topLevelCidr: string;
	namespace: Namespace;
	numberOfSubnets: number;
}) {
	const { topLevelCidr, namespace } = args;
	const resourceGroupName = namespace.next().value;
	const cloudGen = abstractSubspaceGenerator(topLevelCidr, 20, namespace);
	for (const { name, cidr } of cloudGen) {
		const subCidrs = splitCidr(cidr, 26);
		const zeros = new Array(args.numberOfSubnets).fill(0);
		yield {
			type: "ProtoAzureVpc",
			resourceGroupName,
			name,
			cidr,
			region: "eastus2", // TODO: make region configurable
			subnets: zeros.map((_) => ({
				type: "ProtoAzureSubnet",
				name: namespace.next().value,
				cidr: subCidrs.next().value,
			})),
		} satisfies ProtoAzureVpc;
	}
}.bind(this);

const awsVpcGenerator = function* (args: {
	topLevelCidr: string;
	namespace: Namespace;
	numberOfSubnets: number;
}) {
	const { topLevelCidr, namespace } = args;
	const cloudGen = abstractSubspaceGenerator(topLevelCidr, 20, namespace);
	for (const { name, cidr } of cloudGen) {
		const subCidrs = splitCidr(cidr, 26);
		const zeros = new Array(args.numberOfSubnets).fill(0);
		yield {
			type: "ProtoAwsVpc",
			cidr,
			name,
			region: "us-east-1", // TODO: make region configurable
			subnets: zeros.map((_) => ({
				type: "ProtoAwsSubnet",
				name: namespace.next().value,
				cidr: subCidrs.next().value,
			})),
		} satisfies ProtoAwsVpc;
	}
}.bind(this);

const gcpVpcGenerator = function* (args: {
	topLevelCidr: string;
	namespace: Namespace;
	numberOfSubnets: number;
}) {
	const { topLevelCidr, namespace } = args;
	const cloudGen = abstractSubspaceGenerator(topLevelCidr, 20, namespace);
	for (const { name, cidr } of cloudGen) {
		const subCidrs = splitCidr(cidr, 26);
		const zeros = new Array(args.numberOfSubnets).fill(0);
		yield {
			type: "ProtoGcpVpc",
			cidr,
			name,
			projectName: "test-project", // TODO: make project name configurable
			// (this is tricky because making projects programatically is hard)
			subnets: zeros.map((_) => ({
				type: "ProtoGcpSubnet",
				region: "us-east1", // TODO: make region configurable
				name: namespace.next().value,
				cidr: subCidrs.next().value,
			})),
		} satisfies ProtoGcpVpc;
	}
}.bind(this);

export const take =
	(n: number) =>
	<const I extends Generator<T>, T>(iter: I) => {
		const num = z.number().int().min(0).parse(n);
		return Array.from(
			function* () {
				let i = 0;
				while (i < num) {
					const next = iter.next();
					if (next.done) {
						return;
					}
					i = i + 1;
					yield next.value;
				}
			}.bind(this)(),
		);
	};

export const AzureVpcSpecGenerator = (args: {
	cidr: IpV4Cidr;
	numberOfSubnets: number;
	namespace: Namespace;
	numberOfVpcs: number;
}): ProtoAzureVpc[] =>
	take(args.numberOfVpcs)(
		azureVpcGenerator({
			topLevelCidr: args.cidr,
			namespace: args.namespace,
			numberOfSubnets: args.numberOfSubnets,
		}),
	);

export const AwsVpcSpecGenerator = (args: {
	cidr: IpV4Cidr;
	numberOfSubnets: number;
	namespace: Namespace;
	numberOfVpcs: number;
}): ProtoAwsVpc[] =>
	take(args.numberOfVpcs)(
		awsVpcGenerator({
			topLevelCidr: args.cidr,
			namespace: args.namespace,
			numberOfSubnets: args.numberOfSubnets,
		}),
	);

export const GcpVpcSpecGenerator = (args: {
	cidr: IpV4Cidr;
	numberOfSubnets: number;
	namespace: Namespace;
	numberOfVpcs: number;
}): ProtoGcpVpc[] =>
	take(args.numberOfVpcs)(
		gcpVpcGenerator({
			topLevelCidr: args.cidr,
			namespace: args.namespace,
			numberOfSubnets: args.numberOfSubnets,
		}),
	);

export const ProtoConfig = z.object({
	aws: z.array(ProtoAwsVpc),
	azure: z.array(ProtoAzureVpc),
	gcp: z.array(ProtoGcpVpc),
});
export type ProtoConfig = z.infer<typeof ProtoConfig>;

export const ProtoConfigGenerator = (args: {
	cidr: IpV4Cidr;
	namespace: Namespace;
	aws: {
		numberOfSubnets: number;
		numberOfVpcs: number;
	};
	azure: {
		numberOfSubnets: number;
		numberOfVpcs: number;
	};
	gcp: {
		numberOfSubnets: number;
		numberOfVpcs: number;
	};
}): ProtoConfig => {
	const subArgs = {
		aws: {
			cidr: args.cidr,
			namespace: args.namespace,
			numberOfSubnets: args.aws.numberOfSubnets,
			numberOfVpcs: args.aws.numberOfVpcs,
		},
		azure: {
			cidr: args.cidr,
			namespace: args.namespace,
			numberOfSubnets: args.azure.numberOfSubnets,
			numberOfVpcs: args.azure.numberOfVpcs,
		},
		gcp: {
			cidr: args.cidr,
			namespace: args.namespace,
			numberOfSubnets: args.gcp.numberOfSubnets,
			numberOfVpcs: args.gcp.numberOfVpcs,
		},
	};
	return {
		aws: AwsVpcSpecGenerator(subArgs.aws),
		azure: AzureVpcSpecGenerator(subArgs.azure),
		gcp: GcpVpcSpecGenerator(subArgs.gcp),
	} as const;
};

export type ProperUnwrap<T> = T extends pulumi.OutputInstance<Array<infer U>>
	? ProperUnwrap<U>[]
	: T extends pulumi.OutputInstance<infer U>
	? pulumi.Unwrap<U>
	: {
			[K in keyof T]: ProperUnwrap<T[K]>;
	  };

export type MapToOutputs<T extends pulumi.automation.PulumiFn> = Awaited<
	ReturnType<T>
> extends infer U
	? U extends Array<infer Element>
		? { [num: `${bigint}`]: { secret: boolean; value: ProperUnwrap<Element> } }
		: {
				[K in keyof U]: {
					secret: boolean;
					value: ProperUnwrap<U[K]>;
				};
		  }
	: never;
