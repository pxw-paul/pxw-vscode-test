import * as vscode from "vscode";
import { currentFile} from "./utils";
import { codeLensMap,clsLangId, intLangId, macLangId, lsExtensionId } from "./extension";
import { QueryData } from "./types";
import { makeRESTRequest } from "./makeRESTRequest";
import { quoteUDLIdentifier, serverForUri } from "./functions";
import { objectScriptApi } from "./extension";

export class ObjectScriptCodeLensProvider implements vscode.CodeLensProvider {
  public async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    if (![clsLangId, macLangId, intLangId].includes(document.languageId)) {return;}
    const file = currentFile(document);
    if (!file) {return;} // Document is malformed
    const symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
      "vscode.executeDocumentSymbolProvider",
      document.uri
    );
    if (!symbols?.length || token.isCancellationRequested) {return;}

   
    if (!codeLensMap.has(file.name)) {
      const classname=this.classNameFromFileName(file.name);
      const toriginsMap = new Map<string,{uri:vscode.Uri, origin:string}>();

        // Query the server to get the metadata of all appropriate class members
        var data: QueryData = {
          query:  `
                  select * 
                  from (SELECT Parent, Name, Description, Origin, FormalSpec, ReturnType AS Type, 'method' AS MemberType FROM %Dictionary.CompiledMethod WHERE Stub IS NULL 
                        UNION ALL SELECT Parent, Name, Description, Origin, FormalSpec, Type, 'query' AS MemberType FROM %Dictionary.CompiledQuery 
                        UNION ALL SELECT Parent,Name, Description, Origin, NULL AS FormalSpec, Type, 'projection' AS MemberType FROM %Dictionary.CompiledProjection 
                        UNION ALL SELECT Parent,Name, Description, Origin, NULL AS FormalSpec, NULL AS Type, 'index' AS MemberType FROM %Dictionary.CompiledIndex 
                        UNION ALL SELECT Parent,Name, Description, Origin, NULL AS FormalSpec, NULL AS Type, 'foreignkey' AS MemberType FROM %Dictionary.CompiledForeignKey
                        UNION ALL SELECT Parent,Name, Description, Origin, NULL AS FormalSpec, NULL AS Type, 'trigger' AS MemberType FROM %Dictionary.CompiledTrigger 
                        UNION ALL SELECT Parent,Name, Description, Origin, NULL AS FormalSpec, NULL AS Type, 'xdata' AS MemberType FROM %Dictionary.CompiledXData 
                        UNION ALL SELECT Parent,Name, Description, Origin, NULL AS FormalSpec, RuntimeType AS Type, 'property' AS MemberType FROM %Dictionary.CompiledProperty 
                        UNION ALL SELECT Parent,Name, Description, Origin, NULL AS FormalSpec, Type, 'parameter' AS MemberType FROM %Dictionary.CompiledParameter
                  ) as items 
                  where items.parent %INLIST (select $LISTFROMSTRING(Super) from %Dictionary.CompiledClass where name= ? ) SIZE ((10))
                  `,
          parameters: new Array(1).fill(classname)
        };
        const server = await serverForUri(document.uri);     
        const respdata = await makeRESTRequest("POST", 1, "/action/query", server, data);
        if (respdata !== undefined && respdata.data.status.errors.length === 0 && respdata.data.result.content.length > 0) {
          // We got data back
          // 
         
          for (let memobj of respdata.data.result.content) {
            if (!toriginsMap.has(memobj.Name)) {
              const uri = objectScriptApi.getUriForDocument(`${memobj.Origin}.cls`);
              toriginsMap.set(memobj.Name,{uri:uri,origin:memobj.Origin});
            }
          }        
        }
       codeLensMap.set(file.name,toriginsMap);
    } 
    const originsMap=codeLensMap.get(file.name);
    

    const result: vscode.CodeLens[] = [];
    const languageServer: boolean = vscode.extensions.getExtension(lsExtensionId)?.isActive ?? false;
    
    if (document.languageId== clsLangId) {
      // Loop through the class member symbols
      symbols[0].children.forEach((symbol, idx) => {
        const type = symbol.detail.toLowerCase();
        //if (!["xdata", "method", "classmethod", "query", "trigger"].includes(type)) { return;}
        let symbolLine: number;
        if (languageServer) {
          symbolLine = symbol.selectionRange.start.line;
        } else {
          // This extension's symbol provider doesn't have a range
          // that always maps to the first line of the member definition
          for (let l = symbol.range.start.line; l < document.lineCount; l++) {
            symbolLine = l;
            if (!document.lineAt(l).text.startsWith("///")) {break; }
          }
        }
        
        if (originsMap.has(symbol.name)) {
          const origindet=originsMap.get(symbol.name);
          result.push(this.addOverride(symbolLine,origindet.origin,origindet.uri,symbol.name));
        }
    });   
    }
    
    
    return result;
  }
  private addOverride(line: number,  origin: string,uri:vscode.Uri, label: string) {
    return new vscode.CodeLens(this.range(line), {
      title: "Override "+origin,
      command: "vscode.open",
      arguments: [uri,label],
    });
  }
    private range(line: number): vscode.Range {
    return new vscode.Range(line, 0, line, 80);
  }

  private classNameFromFileName(filename:string) {
    let classname="";
    let sep="";
    let fsplit=filename.split(".");
    for (var i=0; i<(fsplit.length-1); i++) {
      classname=classname + sep + fsplit[i];
      sep=".";
    }
    return classname;
  }
}

