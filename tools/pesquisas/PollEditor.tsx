import { useState } from "react";
import {
  issuesFrom,
  pollFromDraft,
  type Draft,
  type Issue,
  type Workspace,
} from "../../lib/forecast/curation";
import type { Poll } from "../../lib/forecast/types";
import { Errors, Field, Group } from "./fields";

const checklist = [
  "Relatório original consultado",
  "Registro conferido",
  "Cenário e identidades corretos",
  "Percentuais atribuídos corretamente a A e B",
  "Unidade e denominador corretos",
  "Datas e amostra conferidas",
  "Duplicidade verificada",
];
export function PollEditor({
  initial,
  data,
  duplicateOf,
  onSave,
  onCancel,
  onDirty,
}: {
  initial: Draft;
  data: Workspace;
  duplicateOf?: Poll;
  onSave: (poll: Poll) => Issue[];
  onCancel: () => void;
  onDirty: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    ...initial,
    curation: initial.curation === "withdrawn" ? "withdrawn" : "pending",
  });
  const [issues, setIssues] = useState<Issue[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [duplicateChecked, setDuplicateChecked] = useState(false);
  function change(key: string, value: string) {
    if ((key === "unit" || key === "denominator") && value !== draft[key]) {
      if (
        !window.confirm(
          "Os números NÃO serão convertidos nem apagados. Confira todos os valores, a margem e a amostra útil na nova unidade/denominador. Continuar?",
        )
      )
        return;
    }
    setDraft((d) => ({
      ...d,
      [key]: value,
      ...(key !== "curation"
        ? { curation: d.curation === "withdrawn" ? "withdrawn" : "pending" }
        : {}),
    }));
    if (key !== "curation") {
      setChecked([]);
      setDuplicateChecked(false);
    }
    onDirty();
  }
  const field = (
    name: string,
    label: string,
    help?: string,
    extra: Partial<Parameters<typeof Field>[0]> = {},
  ) => (
    <Field
      key={name}
      {...{ name, label, help, draft, issues }}
      onChange={change}
      {...extra}
    />
  );
  const candidateName = (id: string) =>
    data.candidates.find((c) => c.id === id)?.name ?? id;
  return (
    <form
      noValidate
      className="editor"
      aria-label="Editor de pesquisa"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const poll = pollFromDraft(draft);
          if (
            poll.curation === "reviewed" &&
            checked.length !== checklist.length
          ) {
            setIssues([
              {
                path: "curation",
                message:
                  "Confirme explicitamente todos os itens de conferência para marcar como revisada.",
              },
            ]);
            return;
          }
          if (
            duplicateOf &&
            (poll.id === duplicateOf.id ||
              (poll.registration === duplicateOf.registration &&
                poll.scenario === duplicateOf.scenario &&
                poll.wave === duplicateOf.wave) ||
              !duplicateChecked)
          ) {
            setIssues([
              {
                path: "id",
                message:
                  "A duplicação exige novo ID, nova identidade registro + cenário + onda e confirmação de conferência.",
              },
            ]);
            return;
          }
          setIssues(onSave(poll));
        } catch (error) {
          setIssues(issuesFrom(error));
        }
      }}
    >
      <h3>
        {duplicateOf
          ? `Duplicar ${duplicateOf.id} como rascunho`
          : "Cadastro / edição de pesquisa"}
      </h3>
      <p>
        Novos registros e novas edições começam pendentes (retiradas permanecem
        retiradas). Somente revisadas e elegíveis entram no cálculo. Salvar não
        exporta arquivos.
      </p>
      <Errors issues={issues} />
      <Group title="Identificação e fonte">
        {field("id", "Identificador único interno")}
        {field(
          "registration",
          "Registro eleitoral",
          "Formato UF-NNNNN/AAAA. O formato não comprova que o registro existe.",
        )}
        {field(
          "institute",
          "Instituto (nome canônico)",
          "Sugestões de nomes já cadastrados; institutos distintos não são unidos.",
          { list: "institutes" },
        )}
        {field("contractor", "Contratante (opcional)")}
        {field("mode", "Modalidade da pesquisa")}
        {field("scenario", "Identificador do cenário")}
        {field("wave", "Onda / rodada de coleta")}
        {field("reportUrl", "URL do relatório original")}
        {field(
          "registrationVerification",
          "Referência da conferência do registro",
        )}
        {field(
          "provenance",
          "URLs de proveniência (uma por linha)",
          "Ao menos uma URL. Apenas fontes verificadas.",
          { multiline: true },
        )}
      </Group>
      <datalist id="institutes">
        {[...new Set(data.polls.map((p) => p.institute))].sort().map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <Group title="Contexto e ordem preservados">
        {field("year", "Ano da pesquisa", undefined, { readOnly: true })}
        {field(
          "candidateA",
          `A — ${candidateName(draft.candidateA)} (primeiro ID)`,
          undefined,
          { readOnly: true },
        )}
        {field(
          "candidateB",
          `B — ${candidateName(draft.candidateB)} (segundo ID)`,
          undefined,
          { readOnly: true },
        )}
      </Group>
      <p>
        Presidente, segundo turno, BR. Alterar a disputa não altera os registros
        existentes.
      </p>
      <button
        type="button"
        onClick={() => {
          if (
            !data.contest ||
            !window.confirm(
              "Vincular explicitamente à dupla e cenário atuais? A e B serão APAGADOS neste rascunho para nova transcrição. O registro salvo não muda até você salvar.",
            )
          )
            return;
          setDraft((d) => ({
            ...d,
            year: String(data.contest!.year),
            scenario: data.contest!.scenario,
            candidateA: data.contest!.candidateIds[0],
            candidateB: data.contest!.candidateIds[1],
            a: "",
            b: "",
            curation: "pending",
          }));
          setChecked([]);
          setDuplicateChecked(false);
          onDirty();
        }}
      >
        Vincular ao contexto atual e limpar A/B
      </button>
      <Group title="Datas">
        {field("fieldStart", "Início do campo")}
        {field("fieldEnd", "Fim do campo")}
        {field("publishedAt", "Publicação")}
        {field("accessedAt", "Acesso à fonte")}
      </Group>
      <p>
        Use YYYY-MM-DD para preservar datas sem horário: o domínio interpreta
        como fim do dia em Brasília (America/Sao_Paulo). Com horário, use ISO
        com segundos e fuso explícito (Z ou ±HH:mm). Não usamos datetime-local
        nem conversão implícita para UTC.
      </p>
      <Group title="Amostra e resultados">
        {field("sampleSize", "Amostra total", "Inteiro positivo.", {
          decimal: true,
        })}
        {field("unit", "Unidade dos resultados e da margem", undefined, {
          options: [
            ["percent", "Percentual (0 a 100)"],
            ["proportion", "Proporção (0 a 1)"],
          ],
        })}
        {field("denominator", "Denominador", undefined, {
          options: [
            ["total", "Total da amostra"],
            ["valid", "Votos válidos"],
          ],
        })}
        {field(
          "a",
          `Valor de A — ${candidateName(draft.candidateA)}`,
          undefined,
          { decimal: true },
        )}
        {field(
          "b",
          `Valor de B — ${candidateName(draft.candidateB)}`,
          undefined,
          { decimal: true },
        )}
        {field("blank", "Brancos (opcional, somente total)", undefined, {
          decimal: true,
        })}
        {field("null", "Nulos (opcional, somente total)", undefined, {
          decimal: true,
        })}
        {field("undecided", "Indecisos (opcional, somente total)", undefined, {
          decimal: true,
        })}
        {field(
          "validSampleSize",
          "Amostra útil (obrigatória em válidos)",
          "Não é inferida nem inventada.",
          { decimal: true },
        )}
        {field(
          "marginOfError",
          "Margem de erro (opcional)",
          "Na mesma unidade dos resultados.",
          { decimal: true },
        )}
        {field(
          "confidenceLevel",
          "Nível de confiança em % (opcional)",
          "95 ou 95% é exportado como 0.95.",
          { decimal: true },
        )}
      </Group>
      {issues
        .filter((i) => !i.path)
        .map((issue, i) => (
          <p className="field-error" role="alert" key={i}>
            {issue.message}
          </p>
        ))}
      <p>
        Vírgula ou ponto são sempre decimais: 46,5 = 46.5. Não use separadores
        de milhar, notação científica ou formatos mistos. Opcionais vazios são
        omitidos, nunca viram zero.
      </p>
      <p>
        Em votos válidos: A+B deve somar 100% (ou 1), amostra útil conhecida,
        sem brancos/nulos/indecisos. Trocar unidade ou denominador não converte
        os valores.
      </p>
      <Group title="Curadoria">
        {field("curation", "Estado de curadoria", undefined, {
          options: [
            ["pending", "Pendente de revisão (pending)"],
            ["reviewed", "Revisada (reviewed)"],
            ["withdrawn", "Retirada (withdrawn)"],
          ],
        })}
      </Group>
      <fieldset>
        <legend>Conferência explícita para marcar como revisada</legend>
        {checklist.map((item) => (
          <label className="check" key={item}>
            <input
              type="checkbox"
              checked={checked.includes(item)}
              onChange={(event) => {
                setChecked((items) =>
                  event.target.checked
                    ? [...items, item]
                    : items.filter((i) => i !== item),
                );
                onDirty();
              }}
            />
            {item}
          </label>
        ))}
        <p>
          Auxílio à conferência manual, não comprovação de revisão independente.
          As confirmações não são exportadas. Qualquer edição de dados exige
          nova conferência.
        </p>
      </fieldset>
      {duplicateOf && (
        <label className="check">
          <input
            type="checkbox"
            checked={duplicateChecked}
            onChange={(e) => {
              setDuplicateChecked(e.target.checked);
              onDirty();
            }}
          />
          Conferi a nova identidade e os dados copiados; esta é uma nova
          pesquisa/onda, não uma cópia do mesmo registro.
        </label>
      )}
      <div className="actions">
        <button type="submit">Salvar pesquisa em memória</button>
        <button type="button" onClick={onCancel}>
          Cancelar edição
        </button>
      </div>
    </form>
  );
}
