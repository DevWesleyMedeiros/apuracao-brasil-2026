import { selectPolls, pollValues } from "./eligibility";
import {
  configSchema,
  contestSchema,
  timestamp,
  type Contest,
  type ModelConfig,
} from "./types";
import { logit, predictiveDistribution } from "./distribution";
const DAY = 86400000; // dia representado em milissegundos
export function aggregate(
  input: unknown[],
  contestInput: Contest,
  asOf: string,
  configInput: ModelConfig,
) {
  const config = configSchema.parse(configInput),
    contest = contestSchema.parse(contestInput),
    cutoff = timestamp(asOf);
  if (cutoff > timestamp(contest.electionAt))
    throw new Error("Corte posterior ao pleito não é previsão pré-eleitoral.");
  const selected = selectPolls(input, contest, asOf);
  if (!selected.polls.length) return null;
  const entries = selected.polls.map((poll) => {
    const { share, nValid } = pollValues(poll);
    logit(share); // Reject degenerate inputs instead of silently clipping them.
    const ageDays = (cutoff - timestamp(poll.fieldEnd)) / DAY;
    const variance = (config.designEffect * share * (1 - share)) / nValid;
    return {
      poll,
      share,
      nValid,
      ageDays,
      variance,
      logWeight: -ageDays / config.decayDays - Math.log(variance),
    };
  });
  const maxLog = Math.max(...entries.map((e) => e.logWeight));
  const sum = entries.reduce((s, e) => s + Math.exp(e.logWeight - maxLog), 0);
  const weighted = entries.map((e) => ({
    ...e,
    weight: Math.exp(e.logWeight - maxLog) / sum,
  }));
  const weightedPollShare = weighted.reduce(
    (s, e) => s + e.weight * e.share,
    0,
  );
  const samplingVarianceP = weighted.reduce(
    (s, e) => s + e.weight ** 2 * e.variance,
    0,
  );
  const commonVarianceP = config.commonSigmaP ** 2;
  const driftVarianceP =
    (config.driftSigmaPPerSqrtDay ** 2 *
      (timestamp(contest.electionAt) - cutoff)) /
    DAY;
  const sigmaP = Math.sqrt(
    samplingVarianceP + commonVarianceP + driftVarianceP,
  );
  return {
    weightedPollShare,
    samplingVarianceP,
    commonVarianceP,
    driftVarianceP,
    sigmaP,
    distribution: predictiveDistribution(weightedPollShare, sigmaP, config),
    eligibleCount: selected.eligibleCount,
    pollCount: weighted.length,
    instituteCount: new Set(weighted.map((e) => e.poll.institute)).size,
    newestFieldAgeDays: Math.min(...weighted.map((e) => e.ageDays)),
    weightConcentration: weighted.reduce((s, e) => s + e.weight ** 2, 0),
    polls: weighted.map((e) => ({
      id: e.poll.id,
      registration: e.poll.registration,
      institute: e.poll.institute,
      fieldEnd: e.poll.fieldEnd,
      publishedAt: e.poll.publishedAt,
      reportUrl: e.poll.reportUrl,
      provenance: e.poll.provenance,
      share: e.share,
      nValid: e.nValid,
      ageDays: e.ageDays,
      weight: e.weight,
    })),
  };
}
export type Aggregate = NonNullable<ReturnType<typeof aggregate>>;
