// Canonical JSON v1: sorted object keys (UTF-16), array order preserved, finite
// JSON values only. No dates, undefined, locale ordering or whitespace.
export function canonicalJson(value: unknown): string {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        const object = value as Record<string, unknown>;
        return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
    }
    throw new Error('Identidade exige valores JSON finitos.');
}
export async function sha256(value: unknown) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const TRANSFORMATION_VERSION = 'tse-normalize-reconcile-v1';
