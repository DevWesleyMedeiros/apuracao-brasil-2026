// Node-only I/O. Never used as writable persistence by a deployed route.
import { readFile, mkdir, rename, writeFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import type { SnapshotReader } from './storage';

export class LocalSnapshotReader implements SnapshotReader {
    constructor(private directory:string) {}
    async read(name:string):Promise<unknown> {
        if(!/^(current|evaluation|status)\.json$|^versions\/[a-f0-9]{64}\.json$/.test(name)) throw new Error('Nome de artefato inválido.');
        return JSON.parse(await readFile(path.join(this.directory,name),'utf8'));
    }
}
export async function writeAtomicJson(file:string,value:unknown) {
    await mkdir(path.dirname(file),{recursive:true});
    const staging=await mkdtemp(path.join(path.dirname(file),'.atomic-'));
    try { const temporary=path.join(staging,'value.json'); await writeFile(temporary,JSON.stringify(value,null,2)); await rename(temporary,file); }
    finally { await rm(staging,{recursive:true,force:true}); }
}
