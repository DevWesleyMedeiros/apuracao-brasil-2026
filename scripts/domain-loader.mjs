import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export function compileDomain(dir) {
  for (const folder of ['lib', 'lib/forecast', 'lib/forecast-server']) {
    if (!fs.existsSync(folder)) continue;
    fs.mkdirSync(path.join(dir, folder), { recursive: true });
    for (const name of fs.readdirSync(folder).filter(n => n.endsWith('.ts'))) {
      const source = fs.readFileSync(path.join(folder, name), 'utf8');
      const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
        .replace(/(['"])(\.{1,2}\/[^'"]+)\1/g, (_, q, file) => `${q}${file.endsWith('.json') ? file : `${file}.mjs`}${q}`);
      fs.writeFileSync(path.join(dir, folder, name.replace(/\.ts$/, '.mjs')), output);
    }
  }
  return name => import(pathToFileURL(path.join(dir, `lib/${name}.mjs`)));
}
