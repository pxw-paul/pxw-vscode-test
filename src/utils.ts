import * as vscode from "vscode";
import {
  OBJECTSCRIPT_FILE_SCHEMA,
  filesystemSchemas,
  OBJECTSCRIPTXML_FILE_SCHEMA,
  schemas,
  workspaceState,
} from "./extension";

import { isCSP} from "./FileSystemProvider";

/** A regex for extracting the name of a class from its content */
export const classNameRegex = /^[ \t]*Class[ \t]+(%?[\p{L}\d\u{100}-\u{ffff}]+(?:\.[\p{L}\d\u{100}-\u{ffff}]+)+)/imu;

/** A regex for extracting the name and type of a routine from its content */
export const routineNameTypeRegex = /^ROUTINE ([^\s]+)(?:\s*\[\s*Type\s*=\s*\b([a-z]{3})\b)?/i;


export interface CurrentFile {
  name: string;
  fileName: string;
  uri: vscode.Uri;
  unredirectedUri?: vscode.Uri;
  workspaceFolder: string;
  uniqueId: string;
}

export interface CurrentTextFile extends CurrentFile {
  content: string;
  eol: vscode.EndOfLine;
}

/** Returns `true` if `uri.scheme` is neither `isfs` nor `isfs-readonly` */
export function notIsfs(uri: vscode.Uri): boolean {
  return !filesystemSchemas.includes(uri.scheme);
}

/** Returns `true` if `uri` has a class or routine file extension */
export function isClassOrRtn(uriOrName: vscode.Uri | string): boolean {
  return ["cls", "mac", "int", "inc"].includes(
    (uriOrName instanceof vscode.Uri ? uriOrName.path : uriOrName).split(".").pop().toLowerCase()
  );
}

/**
 * Determine if this non-ObjectScript local file is importable.
 * @param uri The file to check.
 */
export function isImportableLocalFile(uri: vscode.Uri): boolean {
    // COME BACK TO THIS IF NECESSARY
    return false;

  /*
  // A non-class or routine file is only importable
  // if it's in a web application folder or it's a
  // known Studio abstract document type within a workspace folder
  if (!vscode.workspace.getWorkspaceFolder(uri)) return false;
  return (
    cspAppsForUri(uri).some((cspApp) => uri.path.includes(cspApp + "/")) ||
    otherDocExtsForUri(uri).includes(uri.path.split(".").pop().toLowerCase())
  );*/
}

/**
 * Alter isfs-type uri.path of /.vscode/* files or subdirectories.
 * Rewrite `/.vscode/path/to/file` as `/_vscode/XYZ/path/to/file`
 *  where XYZ comes from the `ns` queryparam of uri.
 *  Also alter query to specify `ns=%SYS&csp=1`
 * Also handles the alternative syntax isfs://server:namespace/
 *  in which there is no ns queryparam
 * For both syntaxes the namespace folder name is uppercased
 *
 * @returns uri, altered if necessary.
 * @throws if `ns` queryparam is missing but required, or if redirection
 * is required but not supported by the server and `err` was passed.
 */
export function redirectDotvscodeRoot(uri: vscode.Uri, err?: vscode.FileSystemError): vscode.Uri {
  if (notIsfs(uri)) { return uri; }
  const dotMatch = uri.path.match(/^(.*)\/\.vscode(\/.*)?$/);
  if (dotMatch) {
    const dotvscodeRoot = uri.with({ path: dotMatch[1] || "/" });
    const rootData = wsServerRootFolders.get(dotvscodeRoot.toString());
    if (!rootData?.redirectDotvscode) {
      // Don't redirect .vscode Uris
      return uri;
    }
    if (!rootData?.canRedirectDotvscode) {
      // Need to redirect .vscode Uris, but the server doesn't support it.
      // Throw if the caller gave us something to throw.
      if (err) {throw err; }
      return uri;
    }
    let namespace: string;
    const andCSP = !isCSP(uri) ? "&csp" : "";
    const nsMatch = `&${uri.query}&`.match(/&ns=([^&]+)&/);
    if (nsMatch) {
      namespace = nsMatch[1].toUpperCase();
      const newQueryString = (("&" + uri.query).replace(`ns=${namespace}`, "ns=%SYS") + andCSP).slice(1);
      return uri.with({ path: `/_vscode/${namespace}${dotMatch[2] || ""}`, query: newQueryString });
    } else {
      const parts = uri.authority.split(":");
      if (parts.length === 2) {
        namespace = parts[1].toUpperCase();
        return uri.with({
          authority: `${parts[0]}:%SYS`,
          path: `/_vscode/${namespace}${dotMatch[2] || ""}`,
          query: uri.query + andCSP,
        });
      }
    }
    throw new Error("No namespace determined from uri");
  } else {
    return uri;
  }
}
interface WSServerRootFolderData {
  redirectDotvscode: boolean;
  canRedirectDotvscode: boolean;
}

const wsServerRootFolders = new Map<string, WSServerRootFolderData>();


export function currentFile(document: vscode.TextDocument): CurrentTextFile | null{
  document =
    document ||
    (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document
      ? vscode.window.activeTextEditor.document
      : null);
  if (!document) {
    return null;
  }
  const fileName:string = document.fileName;
  const fileExt = fileName.split(".").pop().toLowerCase();
  if (
    notIsfs(document.uri) &&
    !isClassOrRtn(document.uri) &&
    // This is a non-class or routine local file, so check if we can import it
    !isImportableLocalFile(document.uri)
  ) {
    return null;
  }
  const eol = document.eol || vscode.EndOfLine.LF;
  const uri = redirectDotvscodeRoot(document.uri);
  const content = document.getText();
  let name = "";
  let ext = "";
  if (fileExt === "cls") {
    // Allow Unicode letters
    const match = content.match(classNameRegex);
    if (match) {
      [, name, ext = "cls"] = match;
    }
  } else if (fileExt.match(/(mac|int|inc)/i)) {
    const match = content.match(routineNameTypeRegex);
    if (match) {
      [, name, ext = "mac"] = match;
    }
  } else {
    name = notIsfs(uri) ? getServerDocName(uri) : isfsDocumentName(uri);
  }
  if (!name) {
    return null;
  }
  name += ext ? "." + ext.toLowerCase() : "";
  const workspaceFolder = currentWorkspaceFolder(document);
  const uniqueId = `${workspaceFolder}:${name}`;

  return {
    content,
    fileName,
    name,
    uri,
    unredirectedUri: document.uri,
    eol,
    workspaceFolder,
    uniqueId,
  };
}

export function isfsDocumentName(uri: vscode.Uri) : string {
    return "isfsDocumentName not written";
}

/** Determine the server name of a non-`isfs` non-ObjectScript file (any file that's not CLS,MAC,INT,INC). */
export function getServerDocName(uri: vscode.Uri): string {
  return "getServerDocName not written";
  /*  
  const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!wsFolder) { return };
  const cspIdx = uri.path.lastIndexOf(cspAppsForUri(uri).find((cspApp) => uri.path.includes(cspApp + "/")));
  if (cspIdx != -1) {
    return uri.path.slice(cspIdx);
  } else if (uri.path.toLowerCase().endsWith(".dfi")) {
    // Determine the file path relative to the workspace folder path
    const wsPath = wsFolder.uri.path + wsFolder.uri.path.endsWith("/") ? "" : "/";
    const relativeFilePath = uri.path.startsWith(wsPath) ? uri.path.slice(wsPath.length) : "";
    if (relativeFilePath == "") return;
    // Check for matching export settings first. If no match, use base name.
    const config = vscode.workspace.getConfiguration("objectscript.export", uri);
    const folder: string = config.get("folder");
    const addCategory: boolean = config.get("addCategory");
    let root = [
      typeof folder == "string" && folder.length ? folder : null,
      addCategory ? getCategory(uri.fsPath, addCategory) : null,
    ]
      .filter(notNull)
      .join("/")
      .replace(/\\/g, "/");
    if (!root.endsWith("/")) root += "/";
    if (relativeFilePath.startsWith(root)) {
      // Convert any folders into "-"
      return relativeFilePath.slice(root.length).replace(/\//g, "-");
    } else {
      // Use the last part of the path since it didn't match the export settings
      return uri.path.split("/").pop();
    }
  } else {
    // Use the last part of the path without checking the export settings
    return uri.path.split("/").pop();
  }*/

}


export function currentWorkspaceFolder(document?: vscode.TextDocument): string {
  document = document ? document : vscode.window.activeTextEditor && vscode.window.activeTextEditor.document;
  if (document) {
    const folder = workspaceFolderOfUri(document.uri);
    // document might not be part of the workspace (e.g. the XXX.code-workspace JSON file)
    if (folder) {
      return folder;
    } else {
      return "";
    }
  }
  const firstFolder =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length
      ? vscode.workspace.workspaceFolders[0]
      : undefined;
  if (firstFolder && schemas.includes(firstFolder.uri.scheme)) {
    return firstFolder.uri.authority;
  } else {
    return workspaceState.get<string>("workspaceFolder") || firstFolder ? firstFolder.name : "";
  }
}

export function workspaceFolderOfUri(uri: vscode.Uri): string {
  if (uri.scheme == OBJECTSCRIPT_FILE_SCHEMA) {
    // For objectscript:// files the authority is the workspace folder name
    return uri.authority;
  } else if (uri.scheme == OBJECTSCRIPTXML_FILE_SCHEMA) {
    // For XML preview files the fragment contains the URI of the original XML file
    return vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(uri.fragment))?.name ?? "";
  } else if (notIsfs(uri)) {
    return vscode.workspace.getWorkspaceFolder(uri)?.name ?? "";
  } else {
    const rootUri = uri.with({ path: "/" }).toString();
    const foundFolder = vscode.workspace.workspaceFolders.find(
      (workspaceFolder) => workspaceFolder.uri.toString() == rootUri
    );
    return foundFolder ? foundFolder.name : uri.authority;
  }
  return "";
}
