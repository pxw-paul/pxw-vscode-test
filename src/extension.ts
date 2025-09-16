import * as vscode from 'vscode';
import { Cache } from './vscode-cache';
import { AllMembersImplementationProvider } from './allMembersImplementationProvider';
import * as url from "url";
import {
  currentWorkspaceFolder
} from "./utils";
import { ObjectScriptCodeLensProvider } from "./codeLensProvider";
/**
 * Cache for cookies from REST requests to InterSystems servers.
 */
export let cookiesCache: Cache;

export let objectScriptApi: any;

/// for utils (from vscode-objectscript)
export const OBJECTSCRIPT_FILE_SCHEMA = "objectscript";
export const OBJECTSCRIPTXML_FILE_SCHEMA = "objectscriptxml";
export const FILESYSTEM_SCHEMA = "isfs";
export const FILESYSTEM_READONLY_SCHEMA = "isfs-readonly";
export const filesystemSchemas = [FILESYSTEM_SCHEMA, FILESYSTEM_READONLY_SCHEMA];
export const schemas = [
  OBJECTSCRIPT_FILE_SCHEMA,
  OBJECTSCRIPTXML_FILE_SCHEMA,
  FILESYSTEM_SCHEMA,
  FILESYSTEM_READONLY_SCHEMA,
];

export const clsLangId = "objectscript-class";
export const macLangId = "objectscript";
export const intLangId = "objectscript-int";
export const incLangId = "objectscript-macros";
export const cspLangId = "objectscript-csp";
export const outputLangId = "vscode-objectscript-output";
export const lsExtensionId = "intersystems.language-server";

export let workspaceState: vscode.Memento;

// keyed by edited classname = map of method names=origin class
export let codeLensMap = new Map<string, Map<string,{uri:vscode.Uri, origin:string}>>();

export const config = (setting?: string, workspaceFolderName?: string): vscode.WorkspaceConfiguration | any => {
  workspaceFolderName = workspaceFolderName || currentWorkspaceFolder();
  if (
    vscode.workspace.workspaceFolders?.length &&
    workspaceFolderName &&
    workspaceFolderName !== "" &&
    vscode.workspace.getConfiguration("intersystems.servers", null).has(workspaceFolderName)
  ) {
    workspaceFolderName = vscode.workspace.workspaceFolders[0].name;
  }
  let prefix: string;
  const workspaceFolder = vscode.workspace.workspaceFolders?.find(
    (el) => el.name.toLowerCase() === workspaceFolderName.toLowerCase()
  );
  if (setting && setting.startsWith("intersystems")) {
    return vscode.workspace.getConfiguration(setting, workspaceFolder);
  } else {
    prefix = "objectscript";
  }

  if (["conn", "export"].includes(setting)) {
    if (workspaceFolderName && workspaceFolderName !== "") {
      if (workspaceFolderName.match(/.+:\d+$/)) {
        const { port, hostname: host, auth, query } = url.parse("http://" + workspaceFolderName, true);
        const { ns = "USER", https = false } = query;
        const [username, password] = (auth || "_SYSTEM:SYS").split(":");
        if (setting == "conn") {
          return {
            active: true,
            https,
            ns,
            host,
            port,
            username,
            password,
          };
        } else if (setting == "export") {
          return {};
        }
      }
    }
  }
  const result = vscode.workspace.getConfiguration(prefix, workspaceFolder?.uri);
  return setting && setting.length ? result.get(setting) : result;
};






export async function activate(context: vscode.ExtensionContext) {

	// Get the main extension exported API
	const objectScriptExt = vscode.extensions.getExtension("intersystems-community.vscode-objectscript");
	objectScriptApi = objectScriptExt?.isActive ? objectScriptExt.exports : objectScriptExt ? await objectScriptExt.activate() : undefined;

	cookiesCache = new Cache(context, "cookies");

	const documentSelector = (...list) =>
    ["file", ...schemas].reduce((acc, scheme) => acc.concat(list.map((language) => ({ scheme, language }))), []);

	context.subscriptions.push(
		vscode.languages.registerImplementationProvider(
			{ language: 'objectscript-class' },
			new AllMembersImplementationProvider()
		),

		vscode.languages.registerCodeLensProvider(
      		documentSelector(clsLangId, macLangId, intLangId),
      		new ObjectScriptCodeLensProvider()
    	)
	);
}

export function deactivate() {}