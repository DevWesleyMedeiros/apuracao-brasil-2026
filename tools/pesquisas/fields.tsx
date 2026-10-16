import { useId, type ReactNode } from 'react';
import type { Draft, Issue } from '../../lib/forecast/curation';

export function Errors({ issues }: { issues: Issue[] }) {
    if (!issues.length) return null;
    return <div className="errors" role="alert"><strong>Corrija os itens abaixo. Nenhum valor será ajustado automaticamente.</strong>
        <ul>{issues.map((issue, i) => <li key={i}>{issue.path ? `${issue.path}: ` : ''}{issue.message}</li>)}</ul>
        <p>Se a soma divergir por arredondamento do relatório, confira a fonte. Não arredonde, limite ou renormalize para passar na validação.</p>
    </div>;
}
type FieldProps = { name: string; label: string; draft: Draft; onChange: (key: string, value: string) => void; issues?: Issue[];
    help?: string; options?: [string, string][]; multiline?: boolean; list?: string; readOnly?: boolean; decimal?: boolean };
export function Field({ name, label, draft, onChange, issues = [], help, options, multiline, list, readOnly, decimal }: FieldProps) {
    const id = useId();
    const errors = issues.filter(issue => issue.path === name || issue.path.startsWith(`${name}.`));
    const props = { id, name, value: draft[name] ?? '', onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(name, event.target.value),
        'aria-invalid': errors.length > 0, 'aria-describedby': `${id}-help`, readOnly };
    return <div className="field"><label htmlFor={id}>{label}</label>
        {options ? <select {...props}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
            : multiline ? <textarea {...props} rows={3} /> : <input {...props} type="text" inputMode={decimal ? 'decimal' : undefined} list={list} autoComplete="off" />}
        <div id={`${id}-help`}>{help && <small>{help}</small>}{errors.map((error, i) => <p className="field-error" key={i}>{error.message}</p>)}</div>
    </div>;
}
export function Group({ title, children }: { title: string; children: ReactNode }) {
    return <fieldset><legend>{title}</legend><div className="grid">{children}</div></fieldset>;
}
export function Source({ url }: { url: string | undefined }) {
    return url ? <a href={url} target="_blank" rel="noopener noreferrer">Abrir fonte ↗</a> : <span>Fonte sem link HTTP(S) seguro</span>;
}
