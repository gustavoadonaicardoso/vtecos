'use client';

import React, { useMemo, useState } from 'react';
import { Play, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import styles from '../automations.module.css';
import {
  aiCategories,
  applySetVariable,
  businessHours,
  emptyContext,
  evaluateCondition,
  inBusinessHours,
  matchMenuOption,
  matchSwitch,
  menuOptions,
  menuText,
  messageMatches,
  nextNodeId,
  pickMessage,
  renderTemplate,
  responseMappings,
  triggerOf,
  validateAnswer,
  VALIDATION_LABEL,
  type FlowGraph,
  type FlowNode,
  type PortName,
  type RunContext,
} from '@/lib/automations/flow';
import { BLOCKS, describeNode, formatMinutes, type EditorOptions } from '../library';

interface SimStep {
  node: FlowNode;
  text: string;
  tone: 'send' | 'info' | 'stop' | 'reply';
}

type Choices = {
  answers: Record<string, string>;
  ai: Record<string, string>;
  webhook: Record<string, 'ok' | 'error'>;
  hours: Record<string, 'auto' | 'yes' | 'no'>;
  ab: Record<string, 'random' | 'a' | 'b'>;
};

const REPLY_TYPES = ['question', 'menu', 'wait-reply'];

/**
 * Mesmas regras do motor (condições, variáveis, menus, validação), mas
 * sem enviar nada: mostra o caminho e as mensagens que sairiam.
 */
function simulate(graph: FlowGraph, options: EditorOptions | null, input: { name: string; message: string; tags: string; stageId: string }, choices: Choices): SimStep[] {
  const trigger = triggerOf(graph);
  if (!trigger) return [];
  const stage = options?.stages.find((item) => item.id === input.stageId);
  const ctx: RunContext = emptyContext({
    lead: { ...emptyContext().lead, id: 'simulado', name: input.name, phone: '5511999998888', stage_id: input.stageId, stage: stage?.name || '', tags: input.tags.split(',').map((tag) => tag.trim()).filter(Boolean), source: 'WhatsApp', created_at: new Date().toISOString(), stage_changed_at: new Date().toISOString() },
    company: { name: 'Sua empresa', phone: '', website: '', address: '' },
    flow: { name: 'Simulação' },
    message: input.message,
    constants: Object.fromEntries(graph.variables.map((variable) => [variable.name, variable.value])),
    input: { nome_do_campo: 'valor de exemplo' },
  });
  if (trigger.type === 'trigger-tag') ctx.vars.etiqueta = trigger.config.tag || '';
  const steps: SimStep[] = [];

  if (trigger.type === 'trigger-message' && !messageMatches(trigger.config, input.message)) {
    return [{ node: trigger, text: 'A mensagem não bate com as palavras-chave: o fluxo não começaria.', tone: 'stop' }];
  }

  let nodeId: string | null = trigger.id;
  const visited = new Map<string, number>();
  while (nodeId && steps.length < 60) {
    const node = graph.nodes.find((item) => item.id === nodeId);
    if (!node) break;
    visited.set(node.id, (visited.get(node.id) || 0) + 1);
    if ((visited.get(node.id) || 0) > 3) {
      steps.push({ node, text: 'O fluxo voltaria para este bloco várias vezes (loop). O motor para depois de 80 passos.', tone: 'stop' });
      break;
    }

    let port: PortName | null = 'default';
    const c = node.config;
    const answer = (choices.answers[node.id] || '').trim();
    switch (node.type) {
      case 'send-message':
        steps.push({ node, text: renderTemplate(pickMessage(c), ctx), tone: 'send' });
        break;
      case 'send-media':
        steps.push({ node, text: `${{ image: '📷', video: '🎬', audio: '🎧', document: '📎' }[c.mediaKind || 'image']} ${c.fileName || c.mediaUrl || '(sem arquivo)'}${c.caption ? `\n${renderTemplate(c.caption, ctx)}` : ''}`, tone: 'send' });
        break;
      case 'question': {
        steps.push({ node, text: renderTemplate(c.question || '', ctx), tone: 'send' });
        if (!answer) {
          steps.push({ node, text: `Sem resposta em ${c.timeoutHours ?? 24}h`, tone: 'info' });
          port = 'no';
          break;
        }
        steps.push({ node, text: answer, tone: 'reply' });
        const result = validateAnswer(c.validation, answer);
        if (!result.ok) {
          steps.push({ node, text: `Resposta inválida (${VALIDATION_LABEL[c.validation || 'text']}). O motor pediria de novo até ${c.maxAttempts ?? 2} vez(es).`, tone: 'info' });
          port = nextNodeId(graph, node.id, 'invalid') ? 'invalid' : 'no';
          break;
        }
        ctx.vars[c.variable || 'resposta'] = result.value;
        ctx.message = answer;
        port = 'yes';
        break;
      }
      case 'menu': {
        steps.push({ node, text: menuText(c, ctx), tone: 'send' });
        if (!answer) {
          steps.push({ node, text: `Sem resposta em ${c.timeoutHours ?? 24}h`, tone: 'info' });
          port = 'no';
          break;
        }
        steps.push({ node, text: answer, tone: 'reply' });
        const option = matchMenuOption(menuOptions(c), answer);
        if (!option) {
          steps.push({ node, text: 'Opção inválida: o motor pediria de novo e depois seguiria por "Opção inválida".', tone: 'info' });
          port = 'invalid';
          break;
        }
        if (c.variable) ctx.vars[c.variable] = option.label;
        ctx.message = answer;
        steps.push({ node, text: `Escolheu: ${option.label}`, tone: 'info' });
        port = option.id;
        break;
      }
      case 'wait-reply':
        if (!answer) {
          steps.push({ node, text: `Sem resposta em ${c.timeoutHours ?? 24}h`, tone: 'info' });
          port = 'no';
        } else {
          steps.push({ node, text: answer, tone: 'reply' });
          if (c.variable) ctx.vars[c.variable] = answer;
          ctx.message = answer;
          port = 'yes';
        }
        break;
      case 'condition': {
        const result = evaluateCondition(c, ctx);
        steps.push({ node, text: `${describeNode(node, options)} → ${result ? 'Sim' : 'Não'}`, tone: 'info' });
        port = result ? 'yes' : 'no';
        break;
      }
      case 'switch': {
        const match = matchSwitch(c, ctx);
        steps.push({ node, text: match ? `Caso: ${match.label || match.value}` : 'Nenhum caso bateu.', tone: 'info' });
        port = match ? match.id : 'no';
        break;
      }
      case 'business-hours': {
        const choice = choices.hours[node.id] || 'auto';
        const inside = choice === 'auto' ? inBusinessHours(businessHours(c), new Date()) : choice === 'yes';
        steps.push({ node, text: inside ? 'Dentro do horário de atendimento.' : 'Fora do horário de atendimento.', tone: 'info' });
        port = inside ? 'yes' : 'no';
        break;
      }
      case 'split-ab': {
        const choice = choices.ab[node.id] || 'random';
        const pathA = choice === 'random' ? Math.random() * 100 < (Number(c.percentA) || 50) : choice === 'a';
        steps.push({ node, text: `Caminho ${pathA ? 'A' : 'B'}.`, tone: 'info' });
        port = pathA ? 'a' : 'b';
        break;
      }
      case 'delay':
        steps.push({ node, text: c.delayMode === 'until_time' ? `Espera até ${c.untilTime}${c.untilWeekdays ? ' (dia útil)' : ''}` : `Espera ${formatMinutes(Number(c.waitMinutes) || 1)}`, tone: 'info' });
        break;
      case 'set-variable': {
        const { name, value } = applySetVariable(c, ctx);
        if (name) ctx.vars[name] = value;
        steps.push({ node, text: `{{${name}}} = ${value || '(vazio)'}`, tone: 'info' });
        break;
      }
      case 'end':
        steps.push({ node, text: c.stopOthers ? 'Encerra o fluxo e as outras automações do contato.' : 'Encerra o fluxo.', tone: 'stop' });
        port = null;
        break;
      case 'webhook': {
        const ok = (choices.webhook[node.id] || 'ok') === 'ok';
        ctx.vars.webhook_status = ok ? '200' : '500';
        for (const mapping of responseMappings(c.responseMap)) ctx.vars[mapping.variable] = ok ? `(${mapping.path} da resposta)` : '';
        steps.push({ node, text: `${c.method || 'POST'} ${renderTemplate(c.url || '', ctx)} → ${ok ? 'Sucesso' : 'Erro'} (não é chamado na simulação)`, tone: 'info' });
        port = ok ? 'default' : 'no';
        break;
      }
      case 'ai-reply': {
        const text = '(a IA escreveria a resposta aqui, seguindo as instruções)';
        if (c.variable) ctx.vars[c.variable] = text;
        steps.push({ node, text, tone: c.aiSend === false ? 'info' : 'send' });
        break;
      }
      case 'ai-classify': {
        const categories = aiCategories(c);
        const chosen = categories.find((item) => item.id === choices.ai[node.id]) || null;
        if (c.variable) ctx.vars[c.variable] = chosen?.label || '';
        steps.push({ node, text: chosen ? `IA classificaria como: ${chosen.label}` : 'IA não identificaria nenhuma categoria.', tone: 'info' });
        port = chosen ? chosen.id : 'no';
        break;
      }
      default:
        steps.push({ node, text: describeNode(node, options), tone: 'info' });
    }
    nodeId = port ? nextNodeId(graph, node.id, port) : null;
  }

  const last = steps[steps.length - 1];
  if (last && last.tone !== 'stop') steps.push({ node: last.node, text: 'Fim do fluxo.', tone: 'stop' });
  return steps;
}

export default function Simulator({ graph, options, onClose }: { graph: FlowGraph; options: EditorOptions | null; onClose: () => void }) {
  const [name, setName] = useState('Maria Souza');
  const [message, setMessage] = useState('Oi, quero um orçamento');
  const [tags, setTags] = useState('');
  const [stageId, setStageId] = useState('');
  const [choices, setChoices] = useState<Choices>({ answers: {}, ai: {}, webhook: {}, hours: {}, ab: {} });
  const [steps, setSteps] = useState<SimStep[] | null>(null);
  const replyNodes = useMemo(() => graph.nodes.filter((node) => REPLY_TYPES.includes(node.type)), [graph]);
  const choiceNodes = useMemo(() => graph.nodes.filter((node) => ['ai-classify', 'webhook', 'business-hours', 'split-ab'].includes(node.type)), [graph]);
  const pick = <K extends keyof Choices>(key: K, id: string, value: Choices[K][string]) => setChoices((current) => ({ ...current, [key]: { ...current[key], [id]: value } }));

  // No body: o editor cria um contexto de empilhamento abaixo do topo do sistema.
  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="sim-title">
        <div className={styles.modalHead}>
          <div>
            <h2 id="sim-title">Simular o fluxo</h2>
            <p>Nada é enviado: veja o caminho e as mensagens que sairiam.</p>
          </div>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.formRow}>
            <label className={styles.field}><span>Nome do contato</span><input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className={styles.field}><span>Mensagem que ele mandou</span><input className={styles.input} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
          </div>
          <div className={styles.formRow}>
            <label className={styles.field}><span>Etiquetas do contato</span><input className={styles.input} value={tags} placeholder="vip, cliente" onChange={(e) => setTags(e.target.value)} /></label>
            <label className={styles.field}>
              <span>Etapa do funil</span>
              <select className={styles.input} value={stageId} onChange={(e) => setStageId(e.target.value)}>
                <option value="">Nenhuma</option>
                {options?.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </select>
            </label>
          </div>
          {replyNodes.map((node) => (
            <label key={node.id} className={styles.field}>
              <span>Resposta em &quot;{node.label}&quot; (vazio = não respondeu){node.type === 'menu' ? ` · ${menuOptions(node.config).map((option, index) => `${index + 1}) ${option.label}`).join(' ')}` : ''}</span>
              <input className={styles.input} value={choices.answers[node.id] || ''} onChange={(e) => pick('answers', node.id, e.target.value)} />
            </label>
          ))}
          {choiceNodes.map((node) => (
            <label key={node.id} className={styles.field}>
              <span>{node.label}</span>
              {node.type === 'ai-classify' && (
                <select className={styles.input} value={choices.ai[node.id] || ''} onChange={(e) => pick('ai', node.id, e.target.value)}>
                  <option value="">Não identificou</option>
                  {aiCategories(node.config).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              )}
              {node.type === 'webhook' && (
                <select className={styles.input} value={choices.webhook[node.id] || 'ok'} onChange={(e) => pick('webhook', node.id, e.target.value as 'ok' | 'error')}>
                  <option value="ok">Responde com sucesso</option>
                  <option value="error">Dá erro</option>
                </select>
              )}
              {node.type === 'business-hours' && (
                <select className={styles.input} value={choices.hours[node.id] || 'auto'} onChange={(e) => pick('hours', node.id, e.target.value as 'auto' | 'yes' | 'no')}>
                  <option value="auto">Horário de agora</option>
                  <option value="yes">Dentro do horário</option>
                  <option value="no">Fora do horário</option>
                </select>
              )}
              {node.type === 'split-ab' && (
                <select className={styles.input} value={choices.ab[node.id] || 'random'} onChange={(e) => pick('ab', node.id, e.target.value as 'random' | 'a' | 'b')}>
                  <option value="random">Sortear</option>
                  <option value="a">Caminho A</option>
                  <option value="b">Caminho B</option>
                </select>
              )}
            </label>
          ))}
          <button type="button" className={styles.primaryBtn} onClick={() => setSteps(simulate(graph, options, { name, message, tags, stageId }, choices))}>
            <Play size={15} /> Simular
          </button>

          {steps && (
            <ol className={styles.simSteps}>
              {steps.length === 0 && <li className={styles.muted}>Adicione um gatilho para simular.</li>}
              {steps.map((step, index) => {
                const block = BLOCKS[step.node.type];
                return (
                  <li key={index} className={styles[`sim_${step.tone}`]}>
                    <span className={styles.blockIcon} style={{ color: block.color, background: `${block.color}1f` }}><block.icon size={14} /></span>
                    <div>
                      <strong>{step.tone === 'stop' && step.text === 'Fim do fluxo.' ? 'Fim' : step.tone === 'reply' ? 'Contato respondeu' : step.node.label}</strong>
                      <p>{step.text}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
