import {existsSync,readFileSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {parse} from "yaml";

export function parseYamlConfiguration(path:string):unknown {
  const resolved=resolveConfigurationPath(path);
  if(!resolved)return null;
  return parse(readFileSync(/* turbopackIgnore: true */ resolved,"utf8"));
}

function resolveConfigurationPath(path:string):string|null {
  if(!path.startsWith(".")&&!path.startsWith("/")) {
    let directory=process.cwd();
    for(let i=0;i<6;i++) {
      const candidate=resolve(directory,path);
      if(existsSync(/* turbopackIgnore: true */ candidate))return candidate;
      const parent=dirname(directory); if(parent===directory)break; directory=parent;
    }
    return null;
  }
  return existsSync(/* turbopackIgnore: true */ path)?resolve(path):null;
}

export function resolveEnvironmentPlaceholders(value:unknown, environment:Record<string,string|undefined>=process.env, sourcePath="configuration"):unknown {
  if(typeof value==="string") return value.replace(/%%env\(([A-Za-z_][A-Za-z0-9_]*)\)%%|%env\(([A-Za-z_][A-Za-z0-9_]*)\)%/g,(_match,escaped:string|undefined,name:string|undefined)=>{
    if(escaped) return `%env(${escaped})%`;
    if(name===undefined) return _match;
    const resolved=environment[name];
    if(resolved===undefined) throw new Error(`Missing environment variable "${name}" while resolving ${sourcePath}`);
    return resolved;
  });
  if(Array.isArray(value)) return value.map(item=>resolveEnvironmentPlaceholders(item,environment,sourcePath));
  if(value!==null&&typeof value==="object") return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,resolveEnvironmentPlaceholders(item,environment,`${sourcePath}.${key}`)]));
  return value;
}

export function loadYamlConfiguration(path:string, environment:Record<string,string|undefined>=process.env):unknown {
  const parsed=parseYamlConfiguration(path);
  return parsed===null?null:resolveEnvironmentPlaceholders(parsed,environment,path);
}
