import { useState } from 'react';
import { MAX_FILE_BYTES, issuesFrom, prepareImport, type Issue, type Workspace } from '../../lib/forecast/curation';
import { Errors } from './fields';

export function Importer({ data, dirty, onApply }: { data: Workspace; dirty: boolean; onApply: (data: Workspace) => void }) {
    const [files, setFiles] = useState<File[]>([]);
    const [staged, setStaged] = useState<Workspace | null>(null);
    const [issues, setIssues] = useState<Issue[]>([]);
    const [loading, setLoading] = useState(false);
    return <div>
        <h3>Importar arquivos locais</h3>
        <p>Selecione um ou mais arquivos com os nomes exatos contest.json, candidates.json e polls.json. Máximo de 2 MiB por arquivo e 2.000 pesquisas. Sem mescla: cada arquivo selecionado substitui o conjunto correspondente. Os demais são preservados.</p>
        <label htmlFor="import-files">Arquivos JSON</label>
        <input id="import-files" type="file" accept=".json,application/json" multiple disabled={loading} onChange={event => {
            setFiles(Array.from(event.target.files ?? [])); setStaged(null); setIssues([]);
        }} />
        <button type="button" disabled={!files.length || loading} onClick={async () => {
            setLoading(true); setIssues([]); setStaged(null);
            try {
                if (files.length > 3 || files.some(file => file.size > MAX_FILE_BYTES)) throw new Error('Selecione no máximo três arquivos de até 2 MiB cada.');
                const inputs = await Promise.all(files.map(async file => ({ name: file.name, size: file.size, text: await file.text() })));
                setStaged(prepareImport(data, inputs));
            } catch (error) { setIssues(issuesFrom(error)); }
            finally { setLoading(false); }
        }}>{loading ? 'Lendo e validando…' : 'Validar e mostrar prévia'}</button>
        <Errors issues={issues} />
        {staged && <div className="preview" role="status">
            <h4>Prévia — ainda não aplicada</h4>
            <p>Substituir: {files.map(f => f.name).join(', ')}.</p>
            <p>Resultado: disputa {staged.contest ? `${staged.contest.year}, eleição ${staged.contest.election}, cenário ${staged.contest.scenario}` : 'não configurada (null)'}; {staged.candidates.length} candidaturas; {staged.polls.length} pesquisas.</p>
            <p>A: {staged.candidates[0]?.name ?? 'ausente'} ({staged.candidates[0]?.id ?? '—'}). B: {staged.candidates[1]?.name ?? 'ausente'} ({staged.candidates[1]?.id ?? '—'}).</p>
            <details><summary>Conferir conteúdo a carregar (prévia limitada a 12.000 caracteres)</summary><pre>{JSON.stringify(staged, null, 2).slice(0, 12000)}</pre></details>
            <p>Registros reviewed importados mantêm o estado informado no arquivo; a ferramenta não atesta a revisão nem a autenticidade.</p>
            <button type="button" onClick={() => {
                if (!window.confirm(dirty ? 'Há alterações locais não exportadas. A importação substituirá os conjuntos selecionados e descartará formulários em edição. Confirmar substituição sem mescla?' : 'Confirmar importação dos conjuntos selecionados, sem mescla?')) return;
                onApply(staged); setStaged(null); setFiles([]);
            }}>Confirmar importação</button>
        </div>}
    </div>;
}

export function download(name: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    // Keep the URL alive briefly for browsers that start the download asynchronously.
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function AfterExport() {
    return <div className="notice"><h3>Depois de baixar os arquivos</h3><ol>
        <li>Revise o conteúdo e confirme que os três downloads foram salvos.</li>
        <li>Substitua os arquivos correspondentes em <code>data/forecast/</code> manualmente.</li>
        <li>Confira o diff do Git.</li>
        <li>Execute testes e validações: <code>pnpm test</code>, <code>pnpm lint</code>, <code>pnpm build</code>, <code>pnpm build:next</code> e <code>pnpm typecheck</code>, nessa ordem para restaurar os tipos Next.</li>
        <li>Abra <code>/projecao</code> e <code>/api/forecast?mode=pre</code> no aplicativo; confira também um corte histórico explícito quando aplicável.</li>
        <li>Um novo build/deploy é necessário para atualizar a produção. A exportação não publica nem altera flags.</li>
    </ol></div>;
}
