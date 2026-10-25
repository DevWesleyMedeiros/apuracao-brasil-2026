import { z } from 'zod';
import { STATES } from '../catalog';

const finite = z.number().finite();
const saoPauloOffset=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',timeZoneName:'shortOffset'});
export const proportionSchema = finite.min(0).max(1);
export function timestamp(value: string): number {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (!dateOnly && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error('Data deve ser ISO com fuso ou YYYY-MM-DD.');
    const day = value.slice(0, 10);
    const parsedDay = new Date(`${day}T00:00:00Z`);
    if (!Number.isFinite(+parsedDay) || parsedDay.toISOString().slice(0, 10) !== day) throw new Error('Data inexistente.');
    if (!dateOnly && (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59)) throw new Error('Horário inválido.');
    let ms = Date.parse(dateOnly ? `${value}T23:59:59.999Z` : value);
    if(dateOnly) {
        const civil=ms;
        for(let i=0;i<2;i++) {
            const offset=saoPauloOffset.formatToParts(new Date(ms)).find(p=>p.type==='timeZoneName')?.value;
            const match=/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(offset??'');
            if(!match)throw new Error('Fuso de Brasília indisponível.');
            const minutes=(Number(match[2])*60+Number(match[3]??0))*(match[1]==='+'?1:-1);
            ms=civil-minutes*60000;
        }
    }
    if (!Number.isFinite(ms)) throw new Error('Data inválida.');
    return ms;
}
export const dateSchema = z.string().refine(value => { try { timestamp(value); return true; } catch { return false; } }, 'Data real ISO obrigatória.');
export const candidateSchema = z.object({ id: z.string().min(1), name: z.string().min(1), sourceUrl: z.string().url(), verifiedAt: dateSchema }).strict();
export const contestSchema = z.object({
    year: z.number().int().min(1989).max(2100), round: z.literal('2'), office: z.literal('1'), scope: z.literal('br'),
    election: z.string().regex(/^\d{1,6}$/), electionAt: dateSchema,
    candidateIds: z.tuple([z.string().min(1), z.string().min(1)]), scenario: z.string().min(1),
}).strict().refine(c => c.candidateIds[0] !== c.candidateIds[1], 'Candidatos devem ser distintos.');
export type Contest = z.infer<typeof contestSchema>;
export const pollSchema = z.object({
    id: z.string().min(1), registration: z.string().regex(/^[A-Z]{2}-\d{5}\/\d{4}$/), institute: z.string().min(1), contractor: z.string().min(1).optional(),
    mode: z.string().min(1), year: z.number().int(), round: z.literal('2'), office: z.literal('1'), scope: z.literal('br'),
    candidateIds: z.tuple([z.string().min(1), z.string().min(1)]), scenario: z.string().min(1), wave: z.string().min(1),
    fieldStart: dateSchema, fieldEnd: dateSchema, publishedAt: dateSchema, reportUrl: z.string().url(), registrationVerification: z.string().min(1),
    sampleSize: z.number().int().positive(), unit: z.enum(['percent', 'proportion']), denominator: z.enum(['total', 'valid']),
    a: finite.nonnegative(), b: finite.nonnegative(), blank: finite.nonnegative().optional(), null: finite.nonnegative().optional(), undecided: finite.nonnegative().optional(),
    validSampleSize: finite.positive().optional(), marginOfError: finite.nonnegative().optional(), confidenceLevel: proportionSchema.optional(),
    accessedAt: dateSchema, curation: z.enum(['pending', 'reviewed', 'withdrawn']), provenance: z.array(z.string().url()).min(1),
}).strict().superRefine((p, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    const scale = p.unit === 'percent' ? 100 : 1;
    const values = [p.a, p.b, p.blank, p.null, p.undecided].filter((v): v is number => v !== undefined);
    if (values.some(v => v > scale) || values.reduce((s, v) => s + v, 0) > scale + 1e-10 || p.a + p.b <= 0) fail('Percentuais ou soma inválidos; não há tolerância editorial de arredondamento.');
    if (p.marginOfError !== undefined && p.marginOfError > scale) fail('Margem fora da unidade declarada.');
    if (p.denominator === 'valid' && (Math.abs(p.a + p.b - scale) > 1e-10 || !p.validSampleSize || p.blank !== undefined || p.null !== undefined || p.undecided !== undefined)) fail('Votos válidos exigem denominador útil conhecido e soma unitária.');
    if (p.validSampleSize && p.validSampleSize > p.sampleSize) fail('Denominador útil excede amostra.');
    if (p.candidateIds[0] === p.candidateIds[1]) fail('Candidatos repetidos.');
    try {
        if (timestamp(p.fieldStart) > timestamp(p.fieldEnd) || timestamp(p.fieldEnd) > timestamp(p.publishedAt) || timestamp(p.publishedAt) > timestamp(p.accessedAt)) fail('Ordenação temporal inválida.');
    } catch { fail('Datas inválidas.'); }
    if (!p.registration.endsWith(`/${p.year}`)) fail('Registro incompatível com ano.');
});
export type Poll = z.infer<typeof pollSchema>;
export const configSchema = z.object({
    version: z.string().min(1), decayDays: finite.positive(), designEffect: finite.min(1), commonSigmaP: finite.nonnegative().max(0.2),
    driftSigmaPPerSqrtDay: finite.nonnegative().max(0.1), distribution: z.enum(['normal', 'student']), degreesOfFreedom: z.number().int().min(3).max(50),
    simulations: z.number().int().min(100).max(20000), seed: z.number().int().min(0).max(4294967295), houseEffectsEnabled: z.literal(false),
}).strict();
export type ModelConfig = z.infer<typeof configSchema>;
export const legacyEvaluationMetadataSchema = z.object({
    id: z.string().min(1), reportUrl: z.string().url(), publishedAt: dateSchema, modelVersion: z.string(), dataVersion: z.string(),
    parametersHash: z.string().min(1), trainingElections: z.array(z.number().int()), evaluationElections: z.array(z.number().int()).min(1),
    operational: z.boolean(), qualityReviewed: z.boolean(), independentHoldout: z.boolean(),
}).strict().refine(e => !e.trainingElections.some(y => e.evaluationElections.includes(y)), 'Treino e avaliação devem ser separados por eleição.')
    .refine(e => !e.operational || (e.trainingElections.length>0 && e.trainingElections.every(y=>y<Math.min(...e.evaluationElections))), 'Avaliação operacional exige treino em eleições anteriores à avaliação.');
// Historical dataset identity is NOT an operational observation hash.
export const evaluationMetadataSchema = z.object({
    schemaVersion: z.literal('2'), id: z.string().min(1), mode: z.enum(['pre','live']), modelVersion: z.string().min(1),
    parametersHash: z.string().min(1), historicalDatasetHash: z.string().regex(/^[a-f0-9]{64}$/), reportHash: z.string().regex(/^[a-f0-9]{64}$/), reportUrl: z.string().url(),
    protocol: z.string().min(1), transformationVersion: z.string().min(1),
    scope: z.object({year:z.number().int(),round:z.literal('2'),office:z.literal('1'),territory:z.literal('br')}).strict(),
    dependencies: z.object({baselineHash:z.string().nullable(),policyHash:z.string().nullable()}).strict(),
    publishedAt: dateSchema, validUntil: dateSchema, reviewedAt: dateSchema, reviewReference: z.string().url(),
    trainingElections:z.array(z.number().int()).min(1), evaluationElections:z.array(z.number().int()).min(1),
    operational:z.boolean(), qualityReviewed:z.boolean(), independentHoldout:z.boolean(),
}).strict().refine(e => !e.trainingElections.some(y=>e.evaluationElections.includes(y)), 'Treino/avaliação sobrepostos.')
    .refine(e => e.trainingElections.every(y=>y<Math.min(...e.evaluationElections)), 'Treino deve preceder avaliação.')
    .refine(e => {try{return timestamp(e.reviewedAt)>=timestamp(e.publishedAt) && timestamp(e.validUntil)>=timestamp(e.reviewedAt);}catch{return false;}}, 'Validade/revisão incompatíveis.');
export const evaluationRegistrySchema=z.object({schemaVersion:z.literal('2'),pre:evaluationMetadataSchema.nullable(),live:evaluationMetadataSchema.nullable()}).strict();
export const baselineSchema = z.object({
    schemaVersion: z.literal('1'), sourceElection: z.string().regex(/^\d{1,6}$/), target: contestSchema,
    sourceHash: z.string().min(1), targetEvidenceHash:z.string().min(1), verifiedAt: dateSchema, verificationUrl: z.string().url(), secondRoundConfirmed: z.literal(true),
    mapping: z.tuple([z.object({ firstId: z.string().min(1), secondId: z.string().min(1) }).strict(), z.object({ firstId: z.string().min(1), secondId: z.string().min(1) }).strict()]),
    territories: z.array(z.object({ uf: z.string(), validVotes: z.number().int().nonnegative(), a: z.number().int().nonnegative(), b: z.number().int().nonnegative() }).strict()).length(28),
}).strict().superRefine((b, ctx) => {
    const codes=b.territories.map(t=>t.uf);
    if(new Set(codes).size!==28 || ![...STATES.map(([uf])=>uf),'zz'].every(uf=>codes.includes(uf))) ctx.addIssue({code:'custom',message:'Baseline exige 27 UFs e ZZ sem duplicatas.'});
    if (b.mapping[0].firstId === b.mapping[1].firstId || b.mapping.some((m, i) => m.secondId !== b.target.candidateIds[i]) || b.sourceElection === b.target.election || b.territories.some(t => t.a + t.b > t.validVotes)) ctx.addIssue({ code: 'custom', message: 'Mapeamento de finalistas ou baseline inválido.' });
});
export type Baseline = z.infer<typeof baselineSchema>;
export const estimateSchema = z.object({ median: proportionSchema, lo: proportionSchema, hi: proportionSchema }).strict().refine(e => e.lo <= e.median && e.median <= e.hi);
export const distributionResultSchema = z.object({ a: estimateSchema, b: estimateSchema, probabilityA: proportionSchema, probabilityB: proportionSchema, probabilityTie: proportionSchema }).strict();
export type DistributionResult = z.infer<typeof distributionResultSchema>;
