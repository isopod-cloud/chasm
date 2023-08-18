#!/usr/bin/env node
import { ToSynthesize } from "./config";
import { Command } from "@commander-js/extra-typings";
// Sam: this is it:      ^^^^^^^^^^^^^^^^^^^^^^^^^^^
// Gotta use the specific extra-typings import
import { writeFileSync } from "fs";
import { isPresent, readFromConfigFile, readFromPackageFile } from "./utils";
import { getSubnets } from "./discovery";
import * as readline from "readline";
import { deProvisionNetwork, provisionNetwork } from "./executor/fixture";
import * as path from "path";

async function main() {
	const program = new Command();

	const packageJson = await readFromPackageFile("./package.json");

	const findCmd = new Command("find")
		.command("find")
		.description("find all the subnets in the currently logged in accounts.")
		.option(
			"-c, --config <filename>",
			"provide a path to your configuration file",
			"./mount/config.json",
		)
		.option(
			"-o, --output-file <file>",
			"provide a path to your discovery output file",
			"./mount/discovered.json",
		)
		.action(async (options) => {
			const config = await readFromConfigFile(options.config);
			console.log("config", config);
			console.log("scraping subnets...");
			const discovered = await getSubnets(config.accounts);
			writeFileSync(options.outputFile, JSON.stringify(discovered, null, 2), {
				flag: "w",
			});
			console.info({
				"discovered-subnets": JSON.stringify(discovered, null, 2),
			});
		});
	const meshCmd = new Command("mesh")
		.command("mesh")
		.description("meshes together all the subnets given in the config file.")
		.requiredOption("-n, --name <value>", "provide a name for the network")
		.option(
			"-c, --config <filename>",
			"provide a path to your configuration file",
			"./mount/config.json",
		)
		.option(
			"-D, --deprovision",
			"destroys the mesh specified in the configuration",
		)
		.option(
			"-u, --url <url>",
			'url to login to the project, defaults to a global pulumi session url if omitted. Acceptable formats include "file://<local-directory-path-with-state>", "https://<self-hosted-site>", "s3://<aws-s3-bucket-name>", "azblob://<azure-blob-container-path>", or "gs://<gcp-bucket-path>"',
		)
		.option(
			"-p, --preview",
			"previews the changes to be made to provision mesh specified in the configuration (NOTE: not yet implemented)",
		)
		.option(
			"-P, --projectName <value>",
			"name of project to setup (this is set to network name if omitted)",
		)
		.option(
			"-w, --workDir <path>",
			"path to the working directory used for setting up the network",
			"./mount/mesh-workdir",
		)
		.option(
			"-F, --pulumiLogFile <pulumi-log-file>",
			'output file for any pulumi logs resulting from meshing (default: "<path>/pulumi-logs.out" where <path> was specified by --workDir)',
		)
		.option(
			"-s, --makeSecurityGroups",
			"Enable the generation of security groups",
		)
		.action(async (options) => {
			if (isPresent(options.name) && isPresent(options.config)) {
				const fromConfigFile = await readFromConfigFile(options.config);
				const meshName = options.name;
				const projectName = isPresent(options.projectName)
					? options.projectName
					: meshName;
				const workDir = options.workDir;
				const pulumiLogFile = isPresent(options.pulumiLogFile)
					? options.pulumiLogFile
					: path.join(workDir, "pulumi-logs.out");
				const inputStream = readline.createInterface({
					input: process.stdin,
					output: process.stdout,
				});
				const psk = await new Promise((resolve) => {
					inputStream.setPrompt("Enter your PSK:");
					inputStream.prompt();
					inputStream.on("line", (text) => {
						inputStream.close();
						resolve(text);
					});
				});
				console.log("PSK:", psk);
				if (!psk) {
					throw Error("must set Pre Shared Key in standard in");
				}

				const toSynthesize = ToSynthesize.parse({
					meshName,
					accounts: fromConfigFile.accounts,
					psk,
					projectName,
					workDir,
					pulumiLogFile,
					makeSecurityGroups: options.makeSecurityGroups ? true : false,
				});

				if (isPresent(options.url)) {
					toSynthesize.url = options.url;
				}

				console.debug({ "synthesize-params": toSynthesize });

				if (options.preview) {
					console.info("Previewing mesh");
					// TODO: restore preview functionality
					// return await previewNetwork(toSynthesize, log);
					throw new Error(
						"Preview functionality not yet implemented due to circularity",
					);
				}
				if (options.deprovision) {
					console.info("Deprovisioning mesh");
					return await deProvisionNetwork(toSynthesize);
				}
				console.info("Provisioning mesh");
				return await provisionNetwork(toSynthesize);
			}
		});

	program
		.version(packageJson.version)
		.name(packageJson.name.split("/")[1])
		.description(packageJson.description ? packageJson.description : "---")
		.usage("<OPTION...>")
		.addCommand(findCmd)
		.addCommand(meshCmd);

	program.parse().opts();
}

if (require.main === module) {
	void main();
}
