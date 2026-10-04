'use client';

import React from 'react';
import { ArrowRight, Trash2, X } from 'lucide-react';
import styles from '../automations.module.css';
import {
  BUILTIN_VARIABLES,
  CONDITION_FIELDS,
  isTrigger,
  portLabel,
  type FlowGraph,
  type FlowNode,
  type NodeConfig,
} from '@/lib/automations/flow';
import { BLOCKS, type EditorOptions } from '../library';

interface InspectorProps {
  node: FlowNode;
  graph: FlowGraph;
  options: EditorOptions | null;
  readOnly: boolean;
  onLabel: (label: string) => void;
  onConfig: (config: NodeConfig) => void;
  onRemoveConnection: (connectionId: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Variáveis disponíveis: as prontas + as respostas guardadas pelas perguntas + as constantes do fluxo. */
function availableVariables(graph: FlowGraph) {
  const answers = graph.nodes.filter((node) => node.type === 'question' && node.config.variable).map((node) => ({ name: node.config.variable!, description: `Resposta de "${node.label}"` }));
  const constants = graph.variables.map((variable) => ({ name: variable.name, description: 'Constante do fluxo' }));
  return [...BUILTIN_VARIABLES, ...answers, ...constants];
}

function VariableChips({ variables, disabled, onPick }: { variables: { name: string; description: string }[]; disabled: boolean; onPick: (name: string) => void }) {
  return (
    <div className={styles.chips}>
      {variables.map((variable) => (
        <button key={variable.name} type="button" title={variable.description} disabled={disabled} onClick={() => onPick(variable.name)}>
          {`{{${variable.name}}}`}
        </button>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export default function Inspector({ node, graph, options, readOnly, onLabel, onConfig, onRemoveConnection, onDelete, onClose }: InspectorProps) {
  const c = node.config;
  const block = BLOCKS[node.type];
  const variables = availableVariables(graph);
  const set = (changes: NodeConfig) => onConfig(changes);
  const insert = (key: 'message' | 'question' | 'caption' | 'fieldValue' | 'conditionValue' | 'tag', name: string) => {
    const current = String(c[key] || '');
    set({ [key]: `${current}${current && !current.endsWith(' ') ? ' ' : ''}{{${name}}}` });
  };
  const waitUnit = (Number(c.waitMinutes) || 0) % 1440 === 0 ? 1440 : (Number(c.waitMinutes) || 0) % 60 === 0 ? 60 : 1;

  const connections = graph.connections.filter((connection) => connection.fromId === node.id || connection.toId === node.id);

  return (
    <div className={styles.inspector}>
      <div className={styles.inspectorHead}>
        <span className={styles.blockIcon} style={{ color: block.color, background: `${block.color}1f` }}><block.icon size={18} /></span>
        <div>
          <small>{isTrigger(node.type) ? 'Gatilho' : 'Bloco'}</small>
          <strong>{block.description}</strong>
        </div>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><X size={16} /></button>
      </div>

      <fieldset className={styles.inspectorBody} disabled={readOnly}>
        <Field label="Nome do bloco">
          <input className={styles.input} value={node.label} maxLength={80} onChange={(e) => onLabel(e.target.value)} />
        </Field>

        {node.type === 'trigger-message' && (
          <>
            <Field label="Quais mensagens">
              <select className={styles.input} value={c.matchMode || 'any'} onChange={(e) => set({ matchMode: e.target.value as NodeConfig['matchMode'] })}>
                <option value="any">Qualquer mensagem</option>
                <option value="keywords">Só se tiver uma das palavras-chave</option>
              </select>
            </Field>
            {c.matchMode === 'keywords' && (
              <Field label="Palavras-chave" hint="Separe por vírgula. Não diferencia maiúsculas nem acentos.">
                <input className={styles.input} value={c.keywords || ''} placeholder="orçamento, preço, valor" onChange={(e) => set({ keywords: e.target.value })} />
              </Field>
            )}
            <label className={styles.check}>
              <input type="checkbox" checked={Boolean(c.onlyNewContacts)} onChange={(e) => set({ onlyNewContacts: e.target.checked })} />
              Só no primeiro contato (número que ainda não era lead)
            </label>
          </>
        )}

        {node.type === 'trigger-lead' && (
          <Field label="Origem do lead">
            <select className={styles.input} value={c.source || 'any'} onChange={(e) => set({ source: e.target.value as NodeConfig['source'] })}>
              <option value="any">Qualquer origem</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="form">Formulário do site / captura de leads</option>
              <option value="manual">Cadastro manual</option>
              <option value="totem">Totem de senhas</option>
            </select>
          </Field>
        )}

        {node.type === 'trigger-stage' && (
          <Field label="Etapa do funil">
            <select className={styles.input} value={c.stageId || ''} onChange={(e) => set({ stageId: e.target.value })}>
              <option value="">Escolha a etapa</option>
              {options?.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
            </select>
          </Field>
        )}

        {isTrigger(node.type) && (
          <Field label="Não repetir para o mesmo lead por (horas)" hint="0 = pode rodar de novo assim que terminar. Evita mandar a mesma mensagem várias vezes.">
            <input className={styles.input} type="number" min={0} max={720} value={c.reentryHours ?? 24} onChange={(e) => set({ reentryHours: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
        )}

        {node.type === 'send-message' && (
          <Field label="Mensagem">
            <textarea className={styles.input} rows={5} value={c.message || ''} onChange={(e) => set({ message: e.target.value })} />
            <VariableChips variables={variables} disabled={readOnly} onPick={(name) => insert('message', name)} />
          </Field>
        )}

        {node.type === 'send-media' && (
          <>
            <Field label="Tipo">
              <select className={styles.input} value={c.mediaKind || 'image'} onChange={(e) => set({ mediaKind: e.target.value as NodeConfig['mediaKind'] })}>
                <option value="image">Imagem</option>
                <option value="document">Arquivo (PDF, planilha...)</option>
              </select>
            </Field>
            <Field label="Link público do arquivo (https)" hint="Ex.: link de um arquivo no Google Drive configurado como público, no seu site ou no Supabase.">
              <input className={styles.input} value={c.mediaUrl || ''} placeholder="https://..." onChange={(e) => set({ mediaUrl: e.target.value })} />
            </Field>
            <Field label="Legenda (opcional)">
              <input className={styles.input} value={c.caption || ''} onChange={(e) => set({ caption: e.target.value })} />
            </Field>
          </>
        )}

        {node.type === 'question' && (
          <>
            <Field label="Pergunta">
              <textarea className={styles.input} rows={4} value={c.question || ''} onChange={(e) => set({ question: e.target.value })} />
              <VariableChips variables={variables} disabled={readOnly} onPick={(name) => insert('question', name)} />
            </Field>
            <Field label="Guardar a resposta como" hint="Use depois como {{nome}} nas mensagens e nas condições.">
              <input className={styles.input} value={c.variable || ''} placeholder="interesse" onChange={(e) => set({ variable: e.target.value.replace(/[^\w]/g, '_').toLowerCase() })} />
            </Field>
            <Field label="Esperar a resposta por (horas)" hint='Sem resposta no prazo, segue pela saída "Sem resposta" (se estiver ligada).'>
              <input className={styles.input} type="number" min={1} max={168} value={c.timeoutHours ?? 24} onChange={(e) => set({ timeoutHours: Math.min(168, Math.max(1, Number(e.target.value) || 1)) })} />
            </Field>
          </>
        )}

        {node.type === 'condition' && (
          <>
            <Field label="Comparar">
              <select className={styles.input} value={c.conditionField || ''} onChange={(e) => set({ conditionField: e.target.value })}>
                {CONDITION_FIELDS.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
                {graph.nodes.filter((item) => item.type === 'question' && item.config.variable).map((item) => (
                  <option key={item.id} value={`var:${item.config.variable}`}>Resposta: {item.config.variable}</option>
                ))}
              </select>
            </Field>
            <Field label="Regra">
              <select className={styles.input} value={c.conditionOperator || 'contains'} onChange={(e) => set({ conditionOperator: e.target.value as NodeConfig['conditionOperator'] })}>
                <option value="contains">Contém</option>
                <option value="not_contains">Não contém</option>
                <option value="equals">É igual a</option>
                <option value="not_equals">É diferente de</option>
                <option value="exists">Tem valor (não está vazio)</option>
                <option value="not_exists">Está vazio</option>
              </select>
            </Field>
            {!['exists', 'not_exists'].includes(c.conditionOperator || '') && (
              <Field label="Valor" hint='Várias opções separadas por vírgula ("sim, quero, pode"). Não diferencia maiúsculas nem acentos.'>
                <input className={styles.input} value={c.conditionValue || ''} onChange={(e) => set({ conditionValue: e.target.value })} />
              </Field>
            )}
          </>
        )}

        {node.type === 'delay' && (
          <Field label="Esperar" hint={options && !options.scheduler ? 'Atenção: o agendador está desligado no servidor (CONTENT_SCHEDULER_ENABLED). Esperas não vão continuar até ele ser ligado.' : undefined}>
            <div className={styles.inline}>
              <input
                className={styles.input}
                type="number"
                min={1}
                value={Math.max(1, Math.round((Number(c.waitMinutes) || 1) / waitUnit))}
                onChange={(e) => set({ waitMinutes: Math.max(1, Number(e.target.value) || 1) * waitUnit })}
              />
              <select className={styles.input} value={waitUnit} onChange={(e) => set({ waitMinutes: Math.max(1, Math.round((Number(c.waitMinutes) || 1) / waitUnit)) * Number(e.target.value) })}>
                <option value={1}>minutos</option>
                <option value={60}>horas</option>
                <option value={1440}>dias</option>
              </select>
            </div>
          </Field>
        )}

        {node.type === 'update-lead' && (
          <>
            <Field label="O que mudar">
              <select className={styles.input} value={c.field || 'stage'} onChange={(e) => set({ field: e.target.value as NodeConfig['field'], fieldValue: '' })}>
                <option value="stage">Etapa do funil</option>
                <option value="assigned_to">Responsável</option>
                <option value="value">Valor</option>
                <option value="name">Nome</option>
                <option value="email">E-mail</option>
              </select>
            </Field>
            {c.field === 'stage' || !c.field ? (
              <Field label="Nova etapa">
                <select className={styles.input} value={c.fieldValue || ''} onChange={(e) => set({ fieldValue: e.target.value })}>
                  <option value="">Escolha a etapa</option>
                  {options?.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                </select>
              </Field>
            ) : c.field === 'assigned_to' ? (
              <Field label="Novo responsável">
                <select className={styles.input} value={c.fieldValue || ''} onChange={(e) => set({ fieldValue: e.target.value })}>
                  <option value="">Escolha a pessoa</option>
                  {options?.team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
              </Field>
            ) : (
              <Field label="Novo valor">
                <input className={styles.input} value={c.fieldValue || ''} onChange={(e) => set({ fieldValue: e.target.value })} />
                <VariableChips variables={variables} disabled={readOnly} onPick={(name) => insert('fieldValue', name)} />
              </Field>
            )}
          </>
        )}

        {node.type === 'tag-lead' && (
          <Field label="Etiqueta">
            <input className={styles.input} value={c.tag || ''} placeholder="cliente quente" maxLength={40} onChange={(e) => set({ tag: e.target.value })} />
          </Field>
        )}

        {node.type === 'notify-team' && (
          <>
            <Field label="Quem recebe">
              <select className={styles.input} value={c.target || 'assigned'} onChange={(e) => set({ target: e.target.value as NodeConfig['target'] })}>
                <option value="assigned">Responsável pelo lead (sem responsável: admins e gerentes)</option>
                <option value="admins">Administradores e gerentes</option>
                <option value="everyone">Toda a equipe</option>
              </select>
            </Field>
            <Field label="Aviso" hint="Aparece no sino de notificações; clicar abre a conversa do lead.">
              <textarea className={styles.input} rows={3} value={c.message || ''} onChange={(e) => set({ message: e.target.value })} />
              <VariableChips variables={variables} disabled={readOnly} onPick={(name) => insert('message', name)} />
            </Field>
          </>
        )}

        {node.type === 'webhook' && (
          <Field label="URL (https)" hint="Recebe um POST JSON com o lead, as respostas e a mensagem. Precisa responder 2xx em até 8 segundos.">
            <input className={styles.input} value={c.url || ''} placeholder="https://hook.make.com/..." onChange={(e) => set({ url: e.target.value })} />
          </Field>
        )}
      </fieldset>

      <div className={styles.inspectorSection}>
        <span className={styles.sectionLabel}>Ligações deste bloco</span>
        {connections.length === 0 && <small className={styles.muted}>Clique na bolinha da direita de um bloco e depois na da esquerda de outro para ligar.</small>}
        {connections.map((connection) => {
          const outgoing = connection.fromId === node.id;
          const other = graph.nodes.find((item) => item.id === (outgoing ? connection.toId : connection.fromId));
          const port = outgoing ? portLabel(node.type, connection.fromPort) : '';
          return (
            <div key={connection.id} className={styles.connectionRow}>
              {outgoing ? <ArrowRight size={13} /> : <ArrowRight size={13} style={{ transform: 'rotate(180deg)' }} />}
              <span>{port ? `${port} → ` : ''}{other?.label || 'Bloco removido'}</span>
              {!readOnly && <button type="button" onClick={() => onRemoveConnection(connection.id)} aria-label="Remover ligação"><X size={13} /></button>}
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <button type="button" className={styles.dangerBtn} onClick={onDelete}><Trash2 size={15} /> Remover bloco</button>
      )}
    </div>
  );
}
