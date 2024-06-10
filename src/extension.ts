// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import { profile } from 'console';

let config: ConanOneConfiguration;

interface ConanOneConfiguration {
	conan_cache_path: string | undefined, // used as CONAN_USER_HOME
	user: string | undefined,
	channel: string | undefined,
	proj_path: string | undefined,
	profile_build: string | undefined,
	profile_host: string | undefined,
	venv_preamble: boolean
}

function configurationValueIsValid(val: string | undefined): boolean {
	return (val !== undefined) && (val !== "");
}

function pickPreferred(x: string | undefined, y: string | undefined, preferX: boolean): string | undefined {
	let chosen = y;
	if ((preferX && (x !== undefined)) || y === undefined || y === "") {
		chosen = x;
	}
	if (chosen === "") {
		chosen = undefined;
	}

	return chosen;
}

function dirExists(path: string | undefined): boolean {
	if (path === undefined) {
		return false;
	}
	return fs.existsSync(path) && fs.lstatSync(path).isDirectory();
}

const INPUT_PROMPTS = {
	"user": "Set user tag (as in 'USER@channel')",
	"channel": "Set channel tag (as in 'USER@channel')",
	"conan_cache_path": "Set CONAN_USER_HOME",
};
interface UserInputValidator {
	(input: string): boolean
}

async function getUserInput(prompt: string, validator?: UserInputValidator): Promise<string | undefined> {
	const user_input = await vscode.window.showInputBox({
		placeHolder: prompt
	});
	if (user_input === undefined) {
		return undefined;
	}
	if (validator !== undefined) {
		const valid = validator(user_input);
		if (!valid) {
			return undefined;
		}
	}

	return user_input;
}

// Populates `dest` with values from `src`. Does not overwrite existing values
// in `dest` unless `overwrite` is `true`.
async function populateConfiguration(ask: boolean): Promise<ConanOneConfiguration> {
	const settings = vscode.workspace.getConfiguration('conanOne');
	let preferEnv = settings.get<boolean>('general.preferEnv');
	if (preferEnv === undefined) {
		preferEnv = true;
	}

	let conan_cache_path = pickPreferred(process.env.conan_cache_path, settings.get<string>('general.conanCachePath'), preferEnv);
	if (!configurationValueIsValid(conan_cache_path) || !dirExists(conan_cache_path)) {
		const header = 'Unable to find conan cache';
		const options: vscode.MessageOptions = {
			detail: 'CONAN_USER_HOME not present in the environment or is invalid.\nSetting general.conanCachePath is unset or is invalid.\nUsing "~" which may be undesirable.'
		};
		// Emit a warning, we couldn't find a sensible cache path
		vscode.window.showWarningMessage(header, options);
		conan_cache_path = process.env.HOME;
	}
	if (ask) {
		conan_cache_path = await getUserInput(INPUT_PROMPTS.conan_cache_path);
	}

	let user = pickPreferred(process.env.CONANONE_USER, settings.get<string>('general.user'), preferEnv);
	if (!configurationValueIsValid(user)) {
		const header = 'Unable to find conan user tag';
		const options: vscode.MessageOptions = {
			detail: 'CONANONE_USER not present in the environment or is invalid.\nSetting general.user is unset or is invalid.'
		};
		// Emit a warning, we couldn't find a 'user' value
		vscode.window.showWarningMessage(header, options);
		user = undefined;
	}
	if (ask) {
		user = await getUserInput(INPUT_PROMPTS.user);
	}

	let channel = pickPreferred(process.env.CONANONE_CHANNEL, settings.get<string>('general.channel'), preferEnv);
	if (!configurationValueIsValid(channel)) {
		const header = 'Unable to find conan channel tag';
		const options: vscode.MessageOptions = {
			detail: 'CONANONE_CHANNEL not present in the environment or is invalid.\nSetting general.channel is unset or is invalid.'
		};
		// Emit a warning, we couldn't find a 'channel' value
		vscode.window.showWarningMessage(header, options);
		channel = undefined;
	}
	if (ask) {
		user = await getUserInput(INPUT_PROMPTS.channel);
	}

	let proj_path = pickPreferred(process.env.CONANONE_PROJ_PATH, settings.get<string>('general.projectPath'), preferEnv);
	if (!configurationValueIsValid(channel)) {
		const header = 'Unable to find conan project';
		const options: vscode.MessageOptions = {
			detail: 'CONANONE_PROJECT not present in the environment or is invalid.\nSetting general.projectPath is unset or is invalid.'
		};
		// Emit a warning, we couldn't find a valid project path
		vscode.window.showWarningMessage(header, options);
	}
	if (ask) {
		proj_path = await selectConanProject();
	}

	let venv_preamble = settings.get<boolean>('dev.venv-preamble');
	if (venv_preamble === undefined) {
		venv_preamble = false;
	}

	config = {
		conan_cache_path: conan_cache_path,
		user: user,
		channel: channel,
		proj_path: proj_path,
		profile_build: undefined,
		profile_host: undefined,
		venv_preamble: venv_preamble
	};

	return config;
}

async function getConanProjectNameAndVersion(): Promise<[string, string]> {
	const terminal = findOrCreateExtensionTerminal(config);
	let preamble = "";
	if (config.venv_preamble) {
		preamble = `source ${config.proj_path}/.venv/bin/activate; `;
	}
    const cmd = `${preamble}CONAN_USER_HOME=${config.conan_cache_path} conan inspect ${config.proj_path} | grep '^name\\|^version'`;

	const [pkg_name, pkg_version] = (await execShell(cmd)).split('\n');
	return [pkg_name.split(': ')[1], pkg_version.split(': ')[1]];
}

const execShell = (cmd: string) =>
	new Promise<string>((resolve, reject) => {
		cp.exec(cmd, (err, out) => {
			if (err) {
				return reject(err);
			}
			return resolve(out);
		});
	});

async function enumerateConanProfiles(): Promise<string[]> {
	let preamble = "";
	if (config.venv_preamble) {
		preamble = `source ${config.proj_path}/.venv/bin/activate; `;
	}
    const cmd = `${preamble}CONAN_USER_HOME=${config.conan_cache_path} conan profile list`;
	const rv = (await execShell(cmd)).trim().split('\n');
	return rv;
}

async function selectConanProject(): Promise<string | undefined> {
	const opendialog_opts = {
		canSelectFolders: false,
		canSelectFiles: true,
		canSelectMany: false,
		filters: {
			'conanfile': ['py', 'txt']
		},
		openLabel: 'select'

	};
	const rv = await vscode.window.showOpenDialog(opendialog_opts);
	if (rv !== undefined) {
		const proj_path_segs = rv[0].fsPath.split(path.sep);
		const filename = proj_path_segs.at(-1);
		if (filename == undefined) {
			return undefined;
		}
		if (!['conanfile.py', 'conanfile.txt'].includes(filename)) {
			console.error(`conanOne: Opened file '${filename}' not in ('conanfile.py', 'conanfile.txt')`);
			return undefined;
		}
		const proj_path = proj_path_segs.slice(0, -1).join(path.sep);
		return proj_path;
	}
	return undefined;
}

async function getConanProjectPackagePath(): Promise<string | undefined> {
	let preamble = "";
	if (config.venv_preamble) {
		preamble = `source ${config.proj_path}/.venv/bin/activate; `;
	}
	const [pkg_name, pkg_version] = await getConanProjectNameAndVersion();
	const pkg_ref = `${pkg_name}/${pkg_version}@${config.user}/${config.channel}`;
	const cmd = `${preamble}CONAN_USER_HOME=${config.conan_cache_path} conan info ${pkg_ref} -pr:h ${config.profile_host} -pr:b ${config.profile_build} --paths --only package_folder`;
	if (config.user !== undefined && config.channel !== undefined) {
		const output_lns = (await execShell(cmd)).trim().split('\n');
		const pkg_path = output_lns.at(-1)?.split(': ').at(-1);
		return pkg_path;
	}

	return undefined;
}

async function getConanProjectBuildPath(): Promise<string | undefined> {
	let preamble = "";
	if (config.venv_preamble) {
		preamble = `source ${config.proj_path}/.venv/bin/activate; `;
	}
	const [pkg_name, pkg_version] = await getConanProjectNameAndVersion();
	const pkg_ref = `${pkg_name}/${pkg_version}@${config.user}/${config.channel}`;
	const cmd = `${preamble}CONAN_USER_HOME=${config.conan_cache_path} conan info ${pkg_ref} -pr:h ${config.profile_host} -pr:b ${config.profile_build} --paths --only build_folder`;
	if (config.user !== undefined && config.channel !== undefined) {
		const output_lns = (await execShell(cmd)).trim().split('\n');
		const build_path = output_lns.at(-1)?.split(': ').at(-1);
		return build_path;
	}

	return undefined;
}

async function presentConanProfileQuickPick(conan_profiles: string[], profile_type: string) {
	const result = await vscode.window.showQuickPick(conan_profiles, {
		placeHolder: `Select a ${profile_type} profile`
	});
	return result;
}

async function selectConanProfile(profile_type: string): Promise<string | undefined> {
	if (config.conan_cache_path === undefined) {
		return undefined;
	}
	const profiles = await enumerateConanProfiles();
	return await presentConanProfileQuickPick(profiles, profile_type);
}

async function conan_create(): Promise<boolean> {
	// If we're asked to run conan create and we don't have a project selected
	// then do so now.
	if (config.proj_path === undefined) {
		config.proj_path = await selectConanProject();
	}
	// TODO: Setting to retrieve these from env vars, if not in settings
	if (config.channel === undefined) {
		vscode.window.showErrorMessage('conan create error: Your conan "channel" has not been set.');
		return false;
	} else if (config.user === undefined) {
		vscode.window.showErrorMessage('conan create error: Your conan "user" has not been set.');
		return false;
	}

	// Get a list of profiles from our conan cache
	const profiles = await enumerateConanProfiles();
	if (config.profile_build === undefined || !profiles.includes(config.profile_build)) {
		// If the user hasn't configured a profile, or it is invalid, ask them
		// to choose one now.
		config.profile_build = await presentConanProfileQuickPick(profiles, 'build');
		if (config.profile_build === undefined) {
			return false;
		}
	}
	if (config.profile_host === undefined || !profiles.includes(config.profile_host)) {
		// If the user hasn't configured a profile, or it is invalid, ask them
		// to choose one now.
		config.profile_host = await presentConanProfileQuickPick(profiles, 'host');
		if (config.profile_host === undefined) {
			return false;
		}
	}

	// Either find our existing terminal, or create a new one and focus it
	const terminal = findOrCreateExtensionTerminal(config);
	if (terminal === undefined) {
		return false;
	}

	const conan_tag = `${config.user}/${config.channel}`;
	terminal.show();
	// Do the build!
	terminal.sendText(`cd ${config.proj_path}`);
	if (config.venv_preamble) {
		terminal.sendText("source .venv/bin/activate"); // FIXME
	}
	terminal.sendText(`CONAN_USER_HOME=${config.conan_cache_path} conan create -pr:h ${config.profile_host} -pr:b ${config.profile_build} . ${conan_tag}`);

	return true;
}

async function openPathInTerminal(target_path: string) {
	const terminal = findOrCreateExtensionTerminal(config);
	if (terminal === undefined) {
		vscode.window.showErrorMessage('Tried to find or create a terminal, but failed');
		return;
	}

	terminal.sendText(`cd ${target_path}`);
	terminal.sendText('ls -la');
	terminal.show();
}

// If a terminal for use by this extension has been created, find it and return
// a handle to it; Otherwise, create one; If we can do neither, return Null
function findOrCreateExtensionTerminal(cfg?: ConanOneConfiguration): vscode.Terminal | undefined {
	const term_name = 'conan-one';
	// Look for an existing terminal of ours
	if ((<any>vscode.window).terminals.length !== 0) {
		for (const term of (<any>vscode.window).terminals) {
			if (term.name === term_name) {
				// We found our terminal
				return term;
			}
		}
	}

	// We didn't find one, so create a new one;
	// We need `conan_project_path` set to do so.
	if (cfg?.proj_path !== undefined) {
		const terminal_options = {
			"name": term_name,
			"cwd": cfg?.proj_path,
			"env": {},
			"message": "Building project with `conan create`",
			"strictEnv": false
		};
		const terminal = vscode.window.createTerminal(terminal_options);
		return terminal;
	}

	// We don't have a conan project configured, bail!
	vscode.window.showErrorMessage('Unable to create a terminal!');
	return undefined;
}

// This function is called the first time any of the functions the extension
// provides are called.
export async function activate(context: vscode.ExtensionContext) {
	// Load our settings to a configuration object used to run conan commands
	config = await populateConfiguration(false);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.configureInteractive', async () => {
				config = await populateConfiguration(true);
			}));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.configure', async () => {
				config = await populateConfiguration(false);
			}));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.conanSelectProject', async () => {
				config.proj_path = await selectConanProject();
			}));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.conanSelectProfile', async () => {
				config.profile_build = await selectConanProfile('build');
				config.profile_host = await selectConanProfile('host');
			}));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.conanCreate', async () => {
				if (config.profile_build === undefined) {
					config.profile_build = await selectConanProfile('build');
				}
				if (config.profile_host === undefined) {
					config.profile_host = await selectConanProfile('host');
				}
				if (!conan_create()) {
					vscode.window.showErrorMessage('conan create encountered an error.');
				}
			}));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.conanOpenBuildDirTerm', async () => {
				if (config.profile_build === undefined) {
					config.profile_build = await selectConanProfile('build');
				}
				if (config.profile_host === undefined) {
					config.profile_host = await selectConanProfile('host');
				}
				const build_path = await getConanProjectBuildPath();
				if (build_path !== undefined) {
					await openPathInTerminal(build_path);
				}
			}));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.conanOpenPackageDirTerm', async () => {
				if (config.profile_build === undefined) {
					config.profile_build = await selectConanProfile('build');
				}
				if (config.profile_host === undefined) {
					config.profile_host = await selectConanProfile('host');
				}
				const pkg_path = await getConanProjectPackagePath();
				if (pkg_path !== undefined) {
					await openPathInTerminal(pkg_path);
				}
			}));
}