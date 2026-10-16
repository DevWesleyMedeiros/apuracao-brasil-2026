import { useEffect, useMemo, useRef, useState } from 'react';
import { duplicateDraft, emptyWorkspace, exportFiles, issuesFrom, newPollDraft, pollToDraft, preview, safeUrl, validateWorkspace, type Draft, type Issue, type Workspace } from '../../lib/forecast/curation';
import type { Poll } from '../../lib/forecast/types';
import { Configuration } from './Configuration';
import { PollEditor } from './PollEditor';
import { AfterExport, download, Importer } from './Transfer';
import { Errors, Source } from './fields';

const curationLabels = { pending: 'Pendente', reviewed: 'Revisada', withdrawn: 'Retirada' };
const filenames = ['contest.json', 'candidates.json', 'polls.json'] as const;
type Editor = { draft: Draft; index: number | null; duplicateOf?: Poll; key: number };
export function App() {
    const [data, setData] = useState<Workspace>(emptyWorkspace);
    const [revision, setRevision] = useState(0);
    const [importRevision, setImportRevision] = useState(0);
    const [touched, setTouched] = useState(false);
    const [exported, setExported] = useState<Record<string, string>>({});
    const [configDirty, setConfigDirty] = useState(false);
    const [pollDirty, setPollDirty] = useState(false);
    const [editor, setEditor] = useState<Editor | null>(null);
    const [institute, setInstitute] = useState('');
    const [curation, setCuration] = useState('');
    const [registration, setRegistration] = useState('');
    const [message, setMessage] = useState('Sessão vazia. Importe arquivos ou configure a disputa para começar.');
    const [cutoff, setCutoff] = useState('');
    const [previewResult, setPreviewResult] = useState<ReturnType<typeof preview> | null>(null);
    const [previewIssues, setPreviewIssues] = useState<Issue[]>([]);
    const [exportIssues, setExportIssues] = useState<Issue[]>([]);
    const [didExport, setDidExport] = useState(false);
    const editorRef = useRef<HTMLHeadingElement>(null);
    const validation = useMemo(() => validateWorkspace(data), [data]);
    const serialized: Record<string, string> = { 'contest.json': `${JSON.stringify(data.contest, null, 2)}\n`, 'candidates.json': `${JSON.stringify(data.candidates, null, 2)}\n`, 'polls.json': `${JSON.stringify(data.polls, null, 2)}\n` };
    const dirty = configDirty || pollDirty || (touched && filenames.some(name => exported[name] !== serialized[name]));
    useEffect(() => {
        if (!dirty) return;
        function beforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ''; }
        window.addEventListener('beforeunload', beforeUnload);
        return () => window.removeEventListener('beforeunload', beforeUnload);
    }, [dirty]);
    function update(next: Workspace) {
        setData(next); setRevision(r => r + 1); setTouched(true); setPreviewResult(null); setPreviewIssues([]); setExportIssues([]);
    }
    function openEditor(draft: Draft, index: number | null, duplicateOf?: Poll) {
        if (pollDirty && !window.confirm('Descartar alterações não salvas do editor de pesquisa?')) return;
        setEditor({ draft, index, duplicateOf, key: Date.now() }); setPollDirty(false);
        window.setTimeout(() => editorRef.current?.focus(), 0);
    }
    function closeEditor() {
        if (pollDirty && !window.confirm('Descartar alterações não salvas desta pesquisa?')) return;
        setEditor(null); setPollDirty(false);
    }
    const candidateName = (id: string) => data.candidates.find(c => c.id === id)?.name ?? id;
    const counts = { pending: data.polls.filter(p => p.curation === 'pending').length, reviewed: data.polls.filter(p => p.curation === 'reviewed').length, withdrawn: data.polls.filter(p => p.curation === 'withdrawn').length };
    return <>
        <a className="skip" href="#disputa">Ir ao conteúdo</a>
        <header>
            <div className="shell"><h1>Curadoria local de pesquisas</h1>
                <p><strong>Ferramenta local de curadoria. O cadastro não confirma a autenticidade de uma pesquisa nem valida a precisão do modelo estatístico.</strong></p>
                <p>Use somente dados de fontes verificadas. A exportação não atualiza automaticamente o site publicado.</p>
                <p role="status"><strong>{dirty ? 'Há alterações não exportadas.' : 'Sem alterações pendentes de exportação.'}</strong> Sem salvamento automático: recarregar ou fechar pode perder o trabalho. A exportação é o mecanismo de preservação; confirme os downloads.</p>
            </div>
        </header>
        <main className="shell">
            <nav aria-label="Etapas"><a href="#disputa">1. Disputa e candidaturas</a><a href="#pesquisas">2. Cadastro e revisão</a><a href="#validacao">3. Validação e exportação</a></nav>
            <p className="status" role="status">{message}</p>
            <section aria-labelledby="import-title"><h2 id="import-title">Arquivos da sessão</h2>
                <Importer key={revision} data={data} dirty={dirty} onApply={next => {
                    update(next); setImportRevision(r => r + 1); setConfigDirty(false); setPollDirty(false); setEditor(null); setExported({});
                    setMessage('Importação concluída. Dados somente em memória; revise e exporte para preservar.');
                }} />
            </section>
            <section id="disputa" aria-labelledby="disputa-title"><h2 id="disputa-title">1. Disputa e candidaturas</h2>
                <Configuration key={`${importRevision}:${JSON.stringify([data.contest, data.candidates])}`} data={data} onCancel={() => setConfigDirty(false)} onDirty={() => { setConfigDirty(true); setPreviewResult(null); }} onSave={value => {
                    update({ ...data, ...value }); setConfigDirty(false); setMessage('Disputa e candidaturas salvas em memória. As pesquisas existentes mantêm suas identidades e valores.');
                }} />
            </section>
            <section id="pesquisas" aria-labelledby="pesquisas-title"><h2 id="pesquisas-title">2. Cadastro e revisão das pesquisas</h2>
                <p>Ações afetam somente esta sessão. Para edição, qualquer pesquisa revisada exige nova confirmação de conferência antes de voltar a reviewed.</p>
                <button type="button" disabled={!data.contest || data.candidates.length !== 2 || configDirty} onClick={() => openEditor(newPollDraft(data.contest!), null)}>Criar pesquisa pendente</button>
                {(!data.contest || data.candidates.length !== 2 || configDirty) && <p>Salve primeiro a disputa e as duas candidaturas.</p>}
                <div className="grid filters">
                    <div className="field"><label htmlFor="filter-institute">Filtrar instituto</label><select id="filter-institute" value={institute} onChange={e => setInstitute(e.target.value)}><option value="">Todos</option>{[...new Set(data.polls.map(p => p.institute))].sort().map(i => <option key={i}>{i}</option>)}</select></div>
                    <div className="field"><label htmlFor="filter-curation">Filtrar curadoria</label><select id="filter-curation" value={curation} onChange={e => setCuration(e.target.value)}><option value="">Todas</option>{Object.entries(curationLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></div>
                    <div className="field"><label htmlFor="filter-registration">Buscar por registro eleitoral</label><input id="filter-registration" value={registration} onChange={e => setRegistration(e.target.value)} /></div>
                </div>
                <div className="table-scroll" role="region" aria-label="Tabela de pesquisas com rolagem horizontal" tabIndex={0}><table>
                    <caption>{data.polls.length} pesquisas na sessão. A: {data.candidates[0]?.name ?? 'não configurada'}; B: {data.candidates[1]?.name ?? 'não configurada'}. Valores exibidos na unidade de cada registro, sem conversão.</caption>
                    <thead><tr>{['Instituto / ID', 'Registro / onda', 'Fim do campo', 'Publicação', 'A (nome / valor)', 'B (nome / valor)', 'Denominador / unidade', 'Amostra', 'Curadoria', 'Validação', 'Ações'].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead>
                    <tbody>{data.polls.map((poll, index) => {
                        if ((institute && poll.institute !== institute) || (curation && poll.curation !== curation) || !poll.registration.toLowerCase().includes(registration.toLowerCase())) return null;
                        const issues = validation.filter(i => i.path === `polls.${index}` || i.path.startsWith(`polls.${index}.`));
                        const copies = data.polls.filter(p => p.registration === poll.registration && p.scenario === poll.scenario && p.wave === poll.wave).length;
                        return <tr key={`${index}:${poll.id}`}>
                            <th scope="row">{poll.institute}<small>{poll.id}</small></th><td>{poll.registration}<small>Onda {poll.wave}</small></td><td>{poll.fieldEnd}</td><td>{poll.publishedAt}</td>
                            <td>{candidateName(poll.candidateIds[0])}: {poll.a}{poll.unit === 'percent' ? '%' : ' (proporção)'}</td><td>{candidateName(poll.candidateIds[1])}: {poll.b}{poll.unit === 'percent' ? '%' : ' (proporção)'}</td>
                            <td>{poll.denominator === 'total' ? 'Total' : 'Válidos'} / {poll.unit === 'percent' ? '%' : 'proporção'}</td><td>{poll.sampleSize}{poll.validSampleSize !== undefined && <small>Útil: {poll.validSampleSize}</small>}</td>
                            <td>{curationLabels[poll.curation]}</td><td>{issues.length ? <><strong>Correção necessária</strong><ul>{issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul></> : 'Contrato compatível'}{copies > 1 && <p>{copies} registros com mesma chave: sujeitos à deduplicação, não pesquisas independentes.</p>}</td>
                            <td><div className="row-actions"><button type="button" onClick={() => openEditor(pollToDraft(poll), index)}>Editar <span className="sr-only">{poll.id}</span></button><button type="button" onClick={() => openEditor(duplicateDraft(poll), null, poll)}>Duplicar rascunho <span className="sr-only">{poll.id}</span></button>
                                <button type="button" onClick={() => {
                                    if (editor && (editor.index === index || pollDirty)) { setMessage('Finalize ou cancele a edição antes de excluir uma pesquisa.'); return; }
                                    if (!window.confirm(`Excluir ${poll.id} da memória? O arquivo original não será alterado.`)) return;
                                    setEditor(null); update({ ...data, polls: data.polls.filter((_, i) => i !== index) }); setMessage(`Pesquisa ${poll.id} excluída somente da sessão.`);
                                }}>Excluir <span className="sr-only">{poll.id}</span></button><Source url={safeUrl(poll.reportUrl)} /></div></td>
                        </tr>;
                    })}</tbody>
                </table></div>
                {editor && <div><h3 ref={editorRef} tabIndex={-1}>Editor ativo — alterações ainda não salvas</h3><PollEditor key={editor.key} initial={editor.draft} data={data} duplicateOf={editor.duplicateOf} onDirty={() => { setPollDirty(true); setPreviewResult(null); }} onCancel={closeEditor} onSave={poll => {
                    const polls = [...data.polls], index = editor.index ?? polls.length;
                    polls[index] = poll;
                    const next = { ...data, polls };
                    const issues = validateWorkspace(next).filter(i => i.path === 'polls' || i.path === `polls.${index}` || i.path.startsWith(`polls.${index}.`));
                    if (issues.length) return issues.map(i => ({ ...i, path: i.path.replace(`polls.${index}.`, '').replace(`polls.${index}`, '') }));
                    update(next); setPollDirty(false); setEditor(null); setMessage(`Pesquisa ${poll.id} salva em memória como ${curationLabels[poll.curation].toLowerCase()}.`);
                    return [];
                }} /></div>}
            </section>
            <section id="validacao" aria-labelledby="validacao-title"><h2 id="validacao-title">3. Validação e exportação</h2>
                <p>{data.polls.length} cadastradas: {counts.pending} pendentes, {counts.reviewed} revisadas, {counts.withdrawn} retiradas. Pendentes válidas podem ser exportadas, mas não entram no cálculo. Retiradas também não entram.</p>
                <h3>Contratos e compatibilidade</h3><Errors issues={validation} />
                {!validation.length && <p>Contratos e compatibilidade verificados. Isso não autentica as fontes nem demonstra precisão estatística.</p>}
                <h3>Prévia de elegibilidade (sem cálculo estatístico)</h3>
                <label htmlFor="cutoff">Instante de corte ISO com segundos e fuso explícito</label><input id="cutoff" type="text" value={cutoff} onChange={e => { setCutoff(e.target.value); setPreviewResult(null); setPreviewIssues([]); }} aria-invalid={previewIssues.length > 0} aria-describedby="cutoff-help" />
                <p id="cutoff-help">Informe AAAA-MM-DDTHH:mm:ss±HH:mm ou Z, até o pleito e após a verificação das candidaturas. As datas das fontes continuam seguindo o fim do dia de Brasília quando não têm horário.</p>
                <button type="button" disabled={configDirty || pollDirty} onClick={() => {
                    try { setPreviewResult(preview(data, cutoff)); setPreviewIssues([]); } catch (error) { setPreviewIssues(issuesFrom(error)); setPreviewResult(null); }
                }}>Executar seleção real do domínio</button>
                <Errors issues={previewIssues} />
                {previewResult && <div className="preview" role="status"><p>Cadastradas: {previewResult.registered} · Revisadas: {previewResult.reviewed} · Elegíveis no corte (antes de deduplicar): {previewResult.eligible} · Elegíveis deduplicadas: {previewResult.deduplicated} · Selecionadas após última onda por instituto: {previewResult.selected.length}.</p>
                    <p>Várias pesquisas do mesmo instituto não necessariamente entram juntas na agregação. Somente os IDs abaixo foram selecionados pela função do domínio:</p>
                    <ul>{previewResult.selected.map(p => <li key={p.id}>{p.id} — {p.institute} — {p.registration} — onda {p.wave}</li>)}</ul>
                    {!previewResult.selected.length && <p>Nenhuma pesquisa selecionada. Não há estimativa inventada.</p>}
                </div>}
                <h3>Baixar JSONs separados</h3>
                <p>Salve ou cancele formulários abertos antes de exportar. Todos os três conjuntos são validados antes de cada download. Não exportamos confirmações de conferência nem estados da interface.</p>
                <Errors issues={exportIssues} />
                <div className="actions">{filenames.map(name => <button type="button" key={name} disabled={validation.length > 0 || configDirty || !!editor} onClick={() => {
                    try {
                        const files = exportFiles(data); download(name, files[name]);
                        setExported(previous => ({ ...previous, [name]: files[name] })); setDidExport(true); setExportIssues([]); setMessage(`Download de ${name} solicitado. Confirme que o navegador salvou o arquivo.`);
                    } catch (error) { setExportIssues(issuesFrom(error)); }
                }}>Baixar {name}{exported[name] === serialized[name] ? ' — versão atual solicitada' : ''}</button>)}</div>
                {didExport && <AfterExport />}
            </section>
        </main>
        <footer className="shell"><p>Uso exclusivamente local · sem banco, autenticação, persistência automática, coleta remota ou escrita no repositório · não altera flags, probabilidades ou modo live.</p></footer>
    </>;
}
