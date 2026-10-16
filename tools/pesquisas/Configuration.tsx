import { useState } from 'react';
import { configurationFromDraft, issuesFrom, type Draft, type Issue, type Workspace } from '../../lib/forecast/curation';
import { PRODUCTION_ELECTION_AT, PRODUCTION_YEAR } from '../../lib/forecast/production-context';
import { Errors, Field, Group } from './fields';

export function Configuration({ data, onSave, onDirty, onCancel }: { data: Workspace; onSave: (value: Pick<Workspace, 'contest' | 'candidates'>) => void; onDirty: () => void; onCancel: () => void }) {
    const [initialDraft] = useState<Draft>(() => {
        const c = data.contest;
        const d: Draft = { year: String(c?.year ?? PRODUCTION_YEAR), election: c?.election ?? '', electionAt: c?.electionAt ?? PRODUCTION_ELECTION_AT, scenario: c?.scenario ?? '' };
        ['A', 'B'].forEach((suffix, i) => {
            const candidate = data.candidates[i];
            d[`id${suffix}`] = candidate?.id ?? c?.candidateIds[i] ?? '';
            d[`name${suffix}`] = candidate?.name ?? '';
            d[`sourceUrl${suffix}`] = candidate?.sourceUrl ?? '';
            d[`verifiedAt${suffix}`] = candidate?.verifiedAt ?? '';
        });
        return d;
    });
    const [draft, setDraft] = useState<Draft>(initialDraft);
    const [issues, setIssues] = useState<Issue[]>([]);
    function change(key: string, value: string) { setDraft(d => ({ ...d, [key]: value })); onDirty(); }
    const field = (name: string, label: string, help?: string, readOnly = false) => <Field key={name} {...{ name, label, help, readOnly, draft, issues }} onChange={change} />;
    return <form noValidate onSubmit={event => {
        event.preventDefault();
        try {
            const value = configurationFromDraft(draft);
            if (data.polls.length && data.contest && (value.contest!.scenario !== data.contest.scenario || value.contest!.candidateIds.some((id, i) => id !== data.contest!.candidateIds[i]))) {
                if (!window.confirm('Alterar cenário ou dupla torna as pesquisas existentes incompatíveis. Os valores e identidades das pesquisas NÃO serão reatribuídos. Será necessário corrigir ou excluir cada registro antes de exportar. Continuar?')) return;
            }
            onSave(value); setIssues([]);
        } catch (error) { setIssues(issuesFrom(error)); }
    }}>
        <p><strong>Presidente · segundo turno · abrangência nacional (BR).</strong> Não deduzimos código oficial nem finalistas.</p>
        <p>O agregador de produção atual aceita somente 2026 e o instante do pleito abaixo. Outro ano ou instante será bloqueado, mesmo que aceito pelo schema.</p>
        <Errors issues={issues} />
        <Group title="Disputa">
            {field('year', 'Ano (escopo atual: 2026)', undefined, true)}
            {field('election', 'Código oficial da eleição', 'Informe o código verificado na fonte oficial. Não é sugerido automaticamente.')}
            {field('electionAt', 'Data e horário do pleito com fuso', 'ISO: AAAA-MM-DDTHH:mm:ss-03:00 ou Z. Fuso equivalente ao instante aceito também é permitido.')}
            {field('scenario', 'Identificador fixo do cenário')}
        </Group>
        {['A', 'B'].map((suffix, i) => <Group key={suffix} title={`Candidatura ${suffix} — ${i === 0 ? 'primeiro' : 'segundo'} identificador`}>
            {field(`id${suffix}`, `Identificador de ${suffix}`)}
            {field(`name${suffix}`, `Nome de ${suffix}`)}
            {field(`sourceUrl${suffix}`, `URL da fonte de ${suffix}`)}
            {field(`verifiedAt${suffix}`, `Data de verificação de ${suffix}`, 'YYYY-MM-DD ou ISO com segundos e fuso. Sem horário = fim do dia em America/Sao_Paulo.')}
        </Group>)}
        <p>A é sempre o primeiro identificador; B, o segundo. Essa ordem será usada em todas as pesquisas, independentemente da ordem no relatório.</p>
        <div className="actions"><button type="submit">Salvar disputa e candidaturas em memória</button>
            <button type="button" onClick={() => {
                if (!window.confirm('Descartar as alterações do formulário da disputa e candidaturas, voltando ao estado salvo em memória?')) return;
                setDraft(initialDraft); setIssues([]); onCancel();
            }}>Descartar alterações deste formulário</button>
        </div>
    </form>;
}
