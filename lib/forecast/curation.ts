// Pure adapters for the local tool. No persistence, I/O, statistical model or flags.
import { z } from 'zod';
import { candidateSchema, contestSchema, pollSchema, timestamp, type Contest, type Poll } from './types';
import { selectPolls, pollValues, pollMatchesContest } from './eligibility';
import { logit } from './distribution';
import { supportsProductionContest } from './production-context';

export type Candidate = z.infer<typeof candidateSchema>;
export type Workspace = { contest: Contest | null; candidates: Candidate[]; polls: Poll[] };
export type Draft = Record<string, string>;
export type Issue = { path: string; message: string };
export class CurationError extends Error {
    constructor(public issues: Issue[]) { super(issues.map(i => `${i.path}: ${i.message}`).join('\n')); }
}
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_POLLS = 2000;
export const emptyWorkspace = (): Workspace => ({ contest: null, candidates: [], polls: [] });
function schemaMessage(issue: z.ZodIssue): string {
    if (issue.code === 'custom') return issue.message;
    if (issue.code === 'invalid_type') return issue.received === 'undefined' ? 'Campo obrigatório.' : `Tipo inválido; esperado: ${issue.expected}.`;
    if (issue.code === 'invalid_string') return issue.validation === 'url' ? 'Informe uma URL válida.' : 'Formato inválido; confira o contrato e o exemplo do campo.';
    if (issue.code === 'too_small') return `Valor ou quantidade abaixo do mínimo (${issue.minimum}).`;
    if (issue.code === 'too_big') return `Valor ou quantidade acima do máximo (${issue.maximum}).`;
    if (issue.code === 'unrecognized_keys') return `Campos desconhecidos não são permitidos: ${issue.keys.join(', ')}.`;
    if (issue.code === 'invalid_enum_value') return 'Opção não permitida pelo contrato.';
    if (issue.code === 'invalid_literal') return `O contrato exige o valor ${String(issue.expected)}.`;
    if (issue.code === 'not_finite') return 'Número deve ser finito.';
    return 'Valor incompatível com o contrato.';
}
export function issuesFrom(error: unknown): Issue[] {
    if (error instanceof CurationError) return error.issues;
    if (error instanceof z.ZodError) return error.issues.map(i => ({ path: i.path.join('.'), message: schemaMessage(i) }));
    return [{ path: '', message: error instanceof Error ? error.message : 'Falha desconhecida.' }];
}
function fail(path: string, message: string): never { throw new CurationError([{ path, message }]); }
export function decimal(value: string): number {
    const text = value.trim();
    // One decimal separator, never grouping, exponent, currency or implicit zero.
    if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(text)) return fail('', 'Use um número sem separador de milhar, com uma única vírgula ou ponto decimal.');
    const number = Number(text.replace(',', '.'));
    if (!Number.isFinite(number)) return fail('', 'Número deve ser finito.');
    return number;
}
export function confidence(value: string): number { return decimal(value.trim().replace(/%$/, '').trim()) / 100; }
export function zoned(value: string): string {
    timestamp(value);
    if (!value.includes('T')) fail('', 'Informe data e horário ISO com segundos e fuso explícito.');
    return value;
}
function numeric(draft: Draft, key: string, percent = false): number {
    try { return percent ? confidence(draft[key] ?? '') : decimal(draft[key] ?? ''); }
    catch (error) { throw new CurationError(issuesFrom(error).map(i => ({ ...i, path: key }))); }
}
export function configurationFromDraft(d: Draft): Pick<Workspace, 'contest' | 'candidates'> {
    const parsed = contestSchema.safeParse({ year: numeric(d, 'year'), round: '2', office: '1', scope: 'br',
        election: d.election.trim(), electionAt: d.electionAt.trim(), scenario: d.scenario.trim(), candidateIds: [d.idA.trim(), d.idB.trim()] });
    if (!parsed.success) throw new CurationError(issuesFrom(parsed.error).map(i => ({ ...i, path: i.path.startsWith('candidateIds.') ? (i.path.endsWith('0') ? 'idA' : 'idB') : i.path || 'idB' })));
    const contest = parsed.data;
    try { zoned(contest.electionAt); } catch (error) { throw new CurationError(issuesFrom(error).map(i => ({ ...i, path: 'electionAt' }))); }
    if (!supportsProductionContest(contest)) fail('electionAt', 'O serviço atual aceita somente 2026 e o instante 2026-10-25T17:00:00-03:00 (ou fuso equivalente).');
    const candidates = ['A', 'B'].map(suffix => {
        try { return candidateSchema.parse({ id: d[`id${suffix}`].trim(), name: d[`name${suffix}`].trim(), sourceUrl: d[`sourceUrl${suffix}`].trim(), verifiedAt: d[`verifiedAt${suffix}`].trim() }); }
        catch (error) { throw new CurationError(issuesFrom(error).map(i => ({ ...i, path: `${i.path}${suffix}` }))); }
    });
    const result = { contest, candidates };
    const issues = validateWorkspace({ ...result, polls: [] });
    if (issues.length) throw new CurationError(issues.map(i => ({ ...i, path: i.path.replace(/^contest\./, '').replace(/^candidates\.0\.(.+)$/, '$1A').replace(/^candidates\.1\.(.+)$/, '$1B') })));
    return result;
}
export function newPollDraft(contest: Contest): Draft {
    return { year: String(contest.year), round: contest.round, office: contest.office, scope: contest.scope,
        candidateA: contest.candidateIds[0], candidateB: contest.candidateIds[1], scenario: contest.scenario,
        unit: 'percent', denominator: 'total', curation: 'pending' };
}
export function pollToDraft(poll: Poll): Draft {
    const draft: Draft = {};
    for (const [key, value] of Object.entries(poll)) {
        if (key === 'candidateIds') continue;
        draft[key] = Array.isArray(value) ? value.join('\n') : String(value);
    }
    draft.confidenceLevel = poll.confidenceLevel === undefined ? '' : String(poll.confidenceLevel * 100);
    draft.candidateA = poll.candidateIds[0]; draft.candidateB = poll.candidateIds[1];
    return draft;
}
export function duplicateDraft(poll: Poll): Draft {
    return { ...pollToDraft(poll), id: '', registration: '', wave: '', curation: 'pending' };
}
const numberFields = ['sampleSize', 'a', 'b', 'blank', 'null', 'undecided', 'validSampleSize', 'marginOfError', 'confidenceLevel'];
const optionalNumbers = new Set(['blank', 'null', 'undecided', 'validSampleSize', 'marginOfError', 'confidenceLevel']);
export function pollFromDraft(d: Draft): Poll {
    const value: Record<string, unknown> = {};
    for (const key of ['id', 'registration', 'institute', 'contractor', 'mode', 'round', 'office', 'scope', 'scenario', 'wave', 'fieldStart', 'fieldEnd', 'publishedAt', 'reportUrl', 'registrationVerification', 'unit', 'denominator', 'accessedAt', 'curation']) {
        const text = (d[key] ?? '').trim();
        if (key !== 'contractor' || text) value[key] = text;
    }
    value.year = numeric(d, 'year');
    value.candidateIds = [d.candidateA, d.candidateB];
    value.provenance = (d.provenance ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    for (const key of numberFields) {
        if (optionalNumbers.has(key) && !(d[key] ?? '').trim()) continue;
        value[key] = numeric(d, key, key === 'confidenceLevel');
    }
    return pollSchema.parse(value);
}
export function validateWorkspace(data: Workspace, allowIncomplete = false): Issue[] {
    const issues: Issue[] = [];
    const add = (path: string, message: string) => issues.push({ path, message });
    const check = (schema: z.ZodTypeAny, input: unknown, path: string) => {
        const result = schema.safeParse(input);
        if (!result.success) for (const i of result.error.issues) add([path, ...i.path].join('.'), schemaMessage(i));
        return result.success;
    };
    const contestValid = data.contest !== null && check(contestSchema, data.contest, 'contest');
    if (!data.contest && !allowIncomplete) add('contest', 'Configure a disputa antes de exportar.');
    if (contestValid && data.contest) {
        try { zoned(data.contest.electionAt); } catch { add('contest.electionAt', 'Horário do pleito exige fuso explícito.'); }
        if (!supportsProductionContest(data.contest)) add('contest.electionAt', 'Incompatível com produção: somente 2026, pleito em 2026-10-25T17:00:00-03:00.');
    }
    if (data.candidates.length !== 2 && (!allowIncomplete || data.candidates.length !== 0)) add('candidates', 'Cadastre exatamente duas candidaturas em ordem A, B.');
    data.candidates.forEach((candidate, i) => {
        if (!check(candidateSchema, candidate, `candidates.${i}`)) return;
        if (contestValid && data.contest && candidate.id !== data.contest.candidateIds[i]) add(`candidates.${i}.id`, 'Identidade/ordem incompatível com a disputa (A primeiro, B segundo).');
        if (contestValid && data.contest && timestamp(candidate.verifiedAt) > timestamp(data.contest.electionAt)) add(`candidates.${i}.verifiedAt`, 'Verificação posterior ao pleito: indisponível em todos os cortes pré-eleitorais.');
    });
    if (new Set(data.candidates.map(c => c.id)).size !== data.candidates.length) add('candidates', 'Identificadores de candidaturas repetidos.');
    const ids = new Map<string, number>();
    const groups = new Map<string, { poll: Poll; index: number }[]>();
    data.polls.forEach((poll, i) => {
        const path = `polls.${i}`;
        if (!check(pollSchema, poll, path)) return;
        if (ids.has(poll.id)) {
            const previous = ids.get(poll.id)!;
            add(`${path}.id`, `ID repetido com pesquisa ${previous + 1}: ${poll.id}.`);
            add(`polls.${previous}.id`, `ID repetido com pesquisa ${i + 1}: ${poll.id}.`);
        }
        ids.set(poll.id, i);
        if (contestValid && data.contest && !pollMatchesContest(poll, data.contest)) add(path, `${poll.id}: ano, cenário ou ordem da dupla incompatível. Valores não foram reatribuídos.`);
        try { logit(pollValues(poll).share); } catch { add(path, `${poll.id}: distribuição degenerada, A e B devem ter votos positivos. Confira a fonte; não ajuste artificialmente.`); }
        const key = `${poll.registration}:${poll.scenario}:${poll.wave}`;
        groups.set(key, [...(groups.get(key) ?? []), { poll, index: i }]);
    });
    // Let the actual domain detect both conflicting curation and conflicting copies.
    // Also inspect pending/withdrawn copies before they can become reviewed later.
    if (contestValid && data.contest) for (const group of groups.values()) {
        if (group.length < 2) continue;
        const polls = group.map(g => g.poll);
        const cutoff = [...polls.flatMap(p => [p.fieldEnd, p.publishedAt])].sort((a, b) => timestamp(b) - timestamp(a))[0];
        try {
            selectPolls(polls, data.contest, cutoff);
            // Use the group's own context to inspect incompatible drafts as well.
            const context = { ...data.contest, year: polls[0].year, scenario: polls[0].scenario, candidateIds: polls[0].candidateIds };
            selectPolls(polls.map(p => ({ ...p, curation: 'reviewed' })), context, cutoff);
        } catch (error) {
            for (const { index } of group) add(`polls.${index}`, `${polls.map(p => p.id).join(', ')}: ${issuesFrom(error)[0].message}`);
        }
    }
    if (data.polls.length > MAX_POLLS) add('polls', `Limite de ${MAX_POLLS} pesquisas.`);
    return issues;
}
export type ImportFile = { name: string; text: string; size: number };
export function prepareImport(current: Workspace, files: ImportFile[]): Workspace {
    if (!files.length) fail('import', 'Selecione ao menos um arquivo.');
    const next: Workspace = { ...current };
    const seen = new Set<string>();
    for (const file of files) {
        if (file.size > MAX_FILE_BYTES || new TextEncoder().encode(file.text).length > MAX_FILE_BYTES) fail(file.name, 'Limite de 2 MiB por arquivo.');
        if (seen.has(file.name)) fail(file.name, 'Arquivo repetido.');
        seen.add(file.name);
        let value: unknown;
        try { value = JSON.parse(file.text); } catch { fail(file.name, 'JSON inválido. O trabalho atual foi preservado.'); }
        try {
            if (file.name === 'contest.json') next.contest = contestSchema.nullable().parse(value);
            else if (file.name === 'candidates.json') next.candidates = candidateSchema.array().max(2).parse(value);
            else if (file.name === 'polls.json') next.polls = pollSchema.array().max(MAX_POLLS).parse(value);
            else fail(file.name, 'Use os nomes contest.json, candidates.json ou polls.json.');
        } catch (error) { throw new CurationError(issuesFrom(error).map(i => ({ ...i, path: `${file.name}.${i.path}` }))); }
    }
    const issues = validateWorkspace(next, true);
    if (issues.length) throw new CurationError(issues);
    return next;
}
export function exportFiles(data: Workspace): Record<'contest.json' | 'candidates.json' | 'polls.json', string> {
    const issues = validateWorkspace(data);
    if (issues.length) throw new CurationError(issues);
    return { 'contest.json': `${JSON.stringify(contestSchema.parse(data.contest), null, 2)}\n`,
        'candidates.json': `${JSON.stringify(data.candidates.map(c => candidateSchema.parse(c)), null, 2)}\n`,
        'polls.json': `${JSON.stringify(data.polls.map(p => pollSchema.parse(p)), null, 2)}\n` };
}
export function preview(data: Workspace, cutoff: string) {
    const issues = validateWorkspace(data);
    if (issues.length) throw new CurationError(issues);
    zoned(cutoff);
    if (timestamp(cutoff) > timestamp(data.contest!.electionAt)) fail('cutoff', 'Corte posterior ao pleito não é pré-eleitoral.');
    if (data.candidates.some(c => timestamp(c.verifiedAt) > timestamp(cutoff))) fail('cutoff', 'Candidaturas ainda não verificadas nesse corte, conforme serviço de produção.');
    const selection = selectPolls(data.polls, data.contest!, cutoff);
    return { registered: data.polls.length, reviewed: data.polls.filter(p => p.curation === 'reviewed').length,
        eligible: data.polls.filter(p => selectPolls([p], data.contest!, cutoff).polls.length > 0).length,
        deduplicated: selection.eligibleCount, selected: selection.polls };
}
export function safeUrl(url: string): string | undefined {
    try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : undefined; } catch { return undefined; }
}
