// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { env } from 'process';
import * as vscode from 'vscode';
import * as cp from "child_process";

let config: ConanOneConfiguration;

// Object used whenever we invoke conan
interface ConanOneConfiguration {
	conan_user_home?: string,
	profile?: string,
	channel?: string,
	user?: string,
	project_path?: string
}

function readSettingsToConfig(): ConanOneConfiguration {
	const settings = vscode.workspace.getConfiguration('conanOne');
	const config = {
		conan_user_home: settings.get<string>('general.conanUserHome'),
		profile: undefined,
		channel: settings.get<string>('general.channel'),
		user: settings.get<string>('general.user'),
		project_path: undefined,
	};

	return config;
}

let conan_user: string | undefined = undefined;
let conan_channel: string | undefined = undefined;
let conan_project_path: string | undefined = undefined;

const execShell = (cmd: string) =>
	new Promise<string>((resolve, reject) => {
		cp.exec(cmd, (err, out) => {
			if (err) {
				return reject(err);
			}
			return resolve(out);
		});
	});

async function enumerateConanProfiles(conan_user_home: string): Promise<string[]> {
	const workdir = conan_user_home + "/..";
	const cmd = `\
source ${workdir}/.venv/bin/activate;
CONAN_USER_HOME=${conan_user_home} conan profile list;`;
	const profiles = (await execShell(cmd)).split('\n').slice(0, -1);
	return profiles;
}

async function selectConanProject(): Promise<string | undefined> {
	const opendialog_opts = {
		canSelectFolders: false,
		canSelectFiles: true,
		canSelectMany: false,
		filters: {
			'conanfile': ['conanfile.py']
		}
	};
	const rv = await vscode.window.showOpenDialog(opendialog_opts);
	if (rv !== undefined) {
		let proj_path = rv[0].fsPath;
		proj_path = proj_path.split('/').slice(0, -1).join('/');
		return proj_path;
	}
	return undefined;
}

async function getConanPackageBuildPath(conan_user_home: string): Promise<string | undefined> {
	const workdir = conan_user_home + "/..";
	const preamble = `\
source ${workdir}/.venv/bin/activate;\
CONAN_USER_HOME=${conan_user_home};`;
	const info_output = (await execShell(`${preamble} conan info ${workdir}`)).split('\n').slice(0, -1);
	const version = info_output[0].split('/')[-1].replace(')', '');
	console.log("Package version: ", version);
	if (conan_user !== undefined && conan_channel !== undefined) {
		const build_path = (await execShell(`${preamble} conan info ${workdir}`)).split('\n')[0];
		return build_path;
	}
	return undefined;
}

async function presentConanProfileQuickPick(conan_profiles: string[]) {
	const result = await vscode.window.showQuickPick(conan_profiles, {
		placeHolder: 'Select a conan profile'
	});
	return result;
}

async function conan_create(cfg: ConanOneConfiguration): Promise<boolean> {
	// Check that we have all of the configuration we need

	// If they've asked to run conan create and we don't have a project selected
	// then do so now.
	if (cfg.project_path === undefined) {
		cfg.project_path = await selectConanProject();
	}
	// TODO: Setting to retrieve these from env vars, if not in settings
	if (cfg.channel === undefined) {
		vscode.window.showErrorMessage('conan create error: Your conan "channel" has not been set.');
		return false;
	} else if (cfg.user === undefined) {
		vscode.window.showErrorMessage('conan create error: Your conan "user" has not been set.');
		return false;
	}

	// FIXME: This should come from the env and settings
	cfg.conan_user_home = cfg.project_path + "/conan-env";

	// Get a list of profiles from our conan cache
	const profiles = await enumerateConanProfiles(cfg.conan_user_home);
	if (cfg.profile === undefined || !profiles.includes(cfg.profile)) {
		// If the user hasn't configured a profile, or it is invalid, ask them
		// to choose one now.
		cfg.profile = await presentConanProfileQuickPick(profiles);
		if (cfg.profile === undefined) {
			return false;
		}
	}

	// Either find our existing terminal, or create a new one and focus it
	const terminal = findOrCreateExtensionTerminal(cfg);
	if (terminal === undefined) {
		return false;
	}

	const conan_tag = `${cfg.user}/${cfg.channel}`;
	terminal.show();
	// Do the build!
	terminal.sendText(`cd ${cfg.project_path}`);
	terminal.sendText("source .venv/bin/activate"); // FIXME
	terminal.sendText(`CONAN_USER_HOME=${cfg.conan_user_home} conan create -pr:h ${cfg.profile} -pr:b ${cfg.profile} . ${conan_tag}`);

	return true;
}

// This function is called the first time any of the functions the extension
// provides are called.
export async function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vscode-conan-ext" is now active!');

	// Load our settings to a configuration object used to run conan commands
	config = readSettingsToConfig();

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.conanSelectProject', async () => {
				conan_project_path = await selectConanProject();
				console.log("conan project path:", conan_project_path);
			}));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.conanCreate', async () => {
				if (!conan_create(config)) {
					vscode.window.showErrorMessage('conan create encountered an error.');
				}
			}));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.conanSetUser', async () => {
				const user = await vscode.window.showInputBox({
					placeHolder: 'Set user (e.g. \'USER@channel\')'
				});
				conan_user = user;
			}));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.conanSetChannel', async () => {
				const channel = await vscode.window.showInputBox({
					placeHolder: 'Set channel (e.g. \'user@CHANNEL\')'
				});
				conan_channel = channel;
			}));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.conanSearch', async () => {
			}));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.conanInfo', async () => {
			}));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.conanOpenBuildDirTerm', async () => {
				const terminal = findOrCreateExtensionTerminal(config);
				const conan_user_home = config.project_path + "/..";
				const preamble = `\
source ${config.project_path}/.venv/bin/activate;
CONAN_USER_HOME=${config.project_path}/conan-env;`;
				const [pkg_name, pkg_version] = (await execShell(`${preamble} conan inspect ${config.project_path} | grep '^name\\|^version'`)).split('\n');
				const pkg_ref = `${pkg_name.split(': ').at(1)}/${pkg_version.split(': ').at(1)}@${config.user}/${config.channel}`;
				const pkg_build_path = (await execShell(`${preamble} conan info ${pkg_ref} --paths --only build_folder`)).split('\n').at(1)?.split(': ').at(1);
				terminal?.sendText(`cd ${pkg_build_path}`);
				terminal?.sendText('ls -la');
				terminal?.show();
			}));

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'extension.conanOpenPackageDirTerm', async () => {
				const terminal = findOrCreateExtensionTerminal(config);
				const conan_user_home = config.project_path + "/..";
				const preamble = `\
source ${config.project_path}/.venv/bin/activate;
CONAN_USER_HOME=${config.project_path}/conan-env;`;
				const [pkg_name, pkg_version] = (await execShell(`${preamble} conan inspect ${config.project_path} | grep '^name\\|^version'`)).split('\n').slice(0, -1);
				const pkg_ref = `${pkg_name.split(': ').at(1)}/${pkg_version.split(': ').at(1)}@${config.user}/${config.channel}`;
				const pkg_build_path = (await execShell(`${preamble} conan info ${pkg_ref} --paths --only package_folder`)).split('\n').at(1)?.split(': ').at(1);
				terminal?.sendText(`cd ${pkg_build_path}`);
				terminal?.sendText('ls -la');
				terminal?.show();
			}));
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
	if (cfg?.project_path !== undefined) {
		const terminal_options = {
			"name": term_name,
			"cwd": conan_project_path,
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
