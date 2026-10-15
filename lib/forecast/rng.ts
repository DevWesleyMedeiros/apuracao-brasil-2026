// Mulberry32; explicit unsigned seed. No ambient randomness.
export function rng(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('Seed uint32 obrigatória.');
    let state = seed;
    return () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function normal(random: () => number) {
    // 1-U excludes log(0), unlike U.
    return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}
export function standardizedStudent(random: () => number, df: number) {
    if (!Number.isInteger(df) || df <= 2 || df > 50) throw new Error('Graus de liberdade inteiros >2 e <=50.');
    let chi2 = 0;
    for (let i = 0; i < df; i++) chi2 += normal(random) ** 2;
    if (chi2 === 0) throw new Error('Sorteio degenerado.');
    return normal(random) / Math.sqrt(chi2 / df) * Math.sqrt((df - 2) / df);
}
