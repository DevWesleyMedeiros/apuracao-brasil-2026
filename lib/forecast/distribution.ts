import { configSchema, distributionResultSchema, type ModelConfig, type DistributionResult } from './types';
import { normal, rng, standardizedStudent } from './rng';
export function logit(p: number) {
    if (!Number.isFinite(p) || p <= 0 || p >= 1) throw new Error('Logit exige proporção estritamente entre 0 e 1.');
    return Math.log(p / (1 - p));
}
export function logistic(x: number) {
    if (!Number.isFinite(x)) throw new Error('Logit não finito.');
    const value = x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
    if (value === 0 || value === 1) throw new Error('Distribuição excedeu precisão numérica em escala logit.');
    return value;
}
export function sigmaToLogit(mu: number, sigmaP: number) {
    logit(mu);
    if (!Number.isFinite(sigmaP) || sigmaP < 0) throw new Error('Sigma deve ser finito e não negativo.');
    return sigmaP / (mu * (1 - mu));
}
// Type 7: linear interpolation at (n-1)*q. Input must already be sorted.
export function quantile(sorted: number[], q: number) {
    if (!sorted.length || !Number.isFinite(q) || q < 0 || q > 1) throw new Error('Quantil inválido.');
    const index = (sorted.length - 1) * q, low = Math.floor(index), high = Math.ceil(index);
    return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}
export function summarize(samples: number[], median?: number, continuous = false): DistributionResult {
    if (!samples.length || samples.some(x => !Number.isFinite(x) || x < 0 || x > 1)) throw new Error('Amostras inválidas.');
    const sorted = [...samples].sort((a, b) => a - b);
    const a = { median: median ?? quantile(sorted, .5), lo: quantile(sorted, .025), hi: quantile(sorted, .975) };
    const probabilityA = samples.filter(x => x > .5).length / samples.length;
    const probabilityB = samples.filter(x => x < .5).length / samples.length;
    const probabilityTie = continuous ? 0 : samples.filter(x => x === .5).length / samples.length;
    return distributionResultSchema.parse({ a, b: { median: 1 - a.median, lo: 1 - a.hi, hi: 1 - a.lo }, probabilityA, probabilityB, probabilityTie });
}
export function predictiveDistribution(mu: number, sigmaP: number, configInput: ModelConfig) {
    const config = configSchema.parse(configInput), center = logit(mu), sigma = sigmaToLogit(mu, sigmaP);
    if (sigma === 0) return summarize([mu], mu);
    const random = rng(config.seed), samples: number[] = [];
    let wins=0,losses=0;
    const add=(latent:number)=>{
        samples.push(logistic(latent));
        // For a continuous law the threshold is latent=0. Floating-point logistic
        // rounding to exactly 0.5 must not manufacture probability mass in a tie.
        if(latent>0)wins++;else if(latent<0)losses++;else throw new Error('Sorteio contínuo caiu exatamente no limiar numérico.');
    };
    for (let i = 0; i < config.simulations; i += 2) {
        const z = config.distribution === 'normal' ? normal(random) : standardizedStudent(random, config.degreesOfFreedom);
        add(center + sigma * z);
        if (samples.length < config.simulations) add(center - sigma * z);
    }
    // The exact median of the symmetric latent distribution is mu, not an estimated mean.
    return {...summarize(samples, mu, true),probabilityA:wins/samples.length,probabilityB:losses/samples.length};
}
