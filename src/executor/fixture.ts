import * as pulumi from "@pulumi/pulumi";

import { IpV4Address, MapToOutputs } from "../types/new-types";

import { ToSynthesize } from "../config";

import {
	getPulumiOutputStream,
	logEngineEvent,
	prepareWorkspaceOptions,
} from "../utils";
import { planMesh } from "./plan-mesh";

export const provisionNetwork = async (args: ToSynthesize): Promise<void> => {
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

		const _meshRefreshResult2 = await meshStack.refresh({
			onOutput: process.stdout.write.bind(process.stdout),
			onEvent: (event) => {
				logEngineEvent(stream, event);
			},
			color: "auto",
		});

		const _meshResult2 = await meshStack.up({
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

export const deProvisionNetwork = async (args: ToSynthesize): Promise<void> => {
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
