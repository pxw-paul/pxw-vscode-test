import * as vscode from "vscode";
import * as path from "path";

/** `isfs(-readonly)` query parameters that configure the documents shown */
export enum IsfsUriParam {
  Project = "project",
  System = "system",
  Generated = "generated",
  Mapped = "mapped",
  Filter = "filter",
  CSP = "csp",
  NS = "ns",
}

interface IsfsUriConfig {
  system: boolean;
  generated: boolean;
  mapped: boolean;
  filter: string;
  project: string;
  csp: boolean;
  ns?: string;
}

/** Return the values of all configuration query parameters for `uri` */
export function isfsConfig(uri: vscode.Uri): IsfsUriConfig {
  const params = new URLSearchParams(uri.query);
  return {
    system: params.get(IsfsUriParam.System) == "1",
    generated: params.get(IsfsUriParam.Generated) == "1",
    mapped: params.get(IsfsUriParam.Mapped) != "0",
    filter: params.get(IsfsUriParam.Filter) ?? "",
    project: params.get(IsfsUriParam.Project) ?? "",
    csp: ["", "1"].includes(params.get(IsfsUriParam.CSP)),
    ns: params.get(IsfsUriParam.NS) || undefined,
  };
}

/**
 * This map contains all csp files contained in a directory
 * within a workspace folder that has a `project` query parameter.
 * The key is the URI for the folder. The value is an array of names of
 * csp files contained within the folder.
 * @example
 * cspFilesInProjectFolder.get(`isfs://iris:user/csp/user/?project=test`) = ["menu.csp"]
 */
const cspFilesInProjectFolder: Map<string, string[]> = new Map();



/** Returns `true` if `uri` is a web application file */
export function isCSP(uri: vscode.Uri): boolean {
  const { csp, project } = isfsConfig(uri);
  if (project) {
    // Projects can contain both CSP and non-CSP files
    // Read the cache of found CSP files to determine if this is one
    const parent = uri
      .with({
        path: path.dirname(uri.path),
      })
      .toString();
    if (cspFilesInProjectFolder.has(parent) && cspFilesInProjectFolder.get(parent).includes(path.basename(uri.path))) {
      return true;
    }
    // Read the parent directory and file is not CSP OR haven't read the parent directory yet
    // Use the file extension to guess if it's a web app file
    const additionalExts: string[] = vscode.workspace
      .getConfiguration("objectscript.projects", uri)
      .get("webAppFileExtensions");
    return [
      "csp",
      "csr",
      "ts",
      "js",
      "css",
      "scss",
      "sass",
      "less",
      "html",
      "json",
      "md",
      "markdown",
      "png",
      "svg",
      "jpeg",
      "jpg",
      "ico",
      "xml",
      "txt",
      ...additionalExts,
    ].includes(uri.path.split(".").pop().toLowerCase());
  }
  return csp;
}
