export function probabilityLabel(value: number | null) {
    if (value === null) return 'Indisponível';
    if (!Number.isFinite(value) || value<0 || value>1) throw new Error('Probabilidade inválida.');
    if (value < .001) return '<0,1%';
    if (value > .999) return '>99,9%';
    return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}
