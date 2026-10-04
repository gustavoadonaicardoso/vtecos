'use client';

import React, { useMemo, useState } from 'react';
import { Play, X } from 'lucide-react';
import styles from '../automations.module.css';
import {
  evaluateCondition,
  messageMatches,
  nextNodeId,
  renderTemplate,
  triggerOf,
  type FlowGraph,
  type FlowNode,
  type PortName,
  type RunContext,
} from '@/lib/automations/flow';
import { BLOCKS, describeNode, formatMinutes, type EditorOptions } from '../library';

interface SimStep {
  node: FlowNode;
  text: string;
  tone: 'send' | 'info' | 'stop';
}

/**
 * Mesmas regras do motor (condições, variáveis, palavras-chave), mas sem
 * enviar nada: mostra o caminho e as mensagens que sairiam.
 */
function simulate(graph: FlowGraph, options: EditorOptions | null, input: { name: string; message: string; answers: Record<string, string> }): SimStep[] {
  const trigger = triggerOf(graph);
  if (!trigger) return [];
  const ctx: RunContext = {
    lead: { name: input.name, phone: '5511999998888', email: '', stage_id: '', stage: '', tags: [], value: 0, source: 'whatsapp' },
    company: 'Sua empresa',
    message: input.message,
    vars: {},
    constants: Object.fromEntries(graph.variables.map((variable) => [variable.name, variable.value])),
  };
  const steps: SimStep[] = [];

  if (trigger.type === 'trigger-message' && !messageMatches(trigger.config, input.message)) {
    return [{ node: trigger, text: 'A mensagem não tem nenhuma das palavras-chave: o fluxo não começaria.', tone: 'stop' }];
  }

  let nodeId: string | null = trigger.id;
  const visited = new Map<string, number>();
  while (nodeId && steps.length < 40) {
    const node = graph.nodes.find((item) => item.id === nodeId);
    if (!node) break;
    visited.set(node.id, (visited.get(node.id) || 0) + 1);
    if ((visited.get(node.id) || 0) > 3) {
      steps.push({ node, text: 'O fluxo voltaria para este bloco várias vezes (loop). O motor para depois de 60 passos.', tone: 'stop' });
      break;
    }

    let port: PortName = 'default';
    const c = node.config;
    switch (node.type) {
      case 'send-message':
        steps.push({ node, text: renderTemplate(c.message || '', ctx), tone: 'send' });
        break;
      case 'send-media':
        steps.push({ node, text: `${c.mediaKind === 'image' ? '📷' : '📎'} ${c.mediaUrl || '(sem link)'}${c.caption ? `\n${renderTemplate(c.caption, ctx)}` : ''}`, tone: 'send' });
        break;
      case 'question': {
        steps.push({ node, text: renderTemplate(c.question || '', ctx), tone: 'send' });
        const answer = (input.answers[node.id] || '').trim();
        if (answer) {
          ctx.vars[c.variable || 'resposta'] = answer;
          ctx.message = answer;
          steps.push({ node, text: `Contato respondeu: "${answer}"`, tone: 'info' });
          port = 'yes';
        } else {
          steps.push({ node, text: `Sem resposta em ${c.timeoutHours ?? 24}h`, tone: 'info' });
          port = 'no';
        }
        break;
      }
      case 'condition': {
        const result = evaluateCondition(c, ctx);
        steps.push({ node, text: `${describeNode(node, options)} → ${result ? 'Sim' : 'Não'}`, tone: 'info' });
        port = result ? 'yes' : 'no';
        break;
      }
      case 'delay':
        steps.push({ node, text: `Espera ${formatMinutes(Number(c.waitMinutes) || 1)}`, tone: 'info' });
        break;
      default:
        steps.push({ node, text: describeNode(node, options), tone: 'info' });
    }
    nodeId = nextNodeId(graph, node.id, port);
  }

  const last = steps[steps.length - 1];
  if (last && last.tone !== 'stop') steps.push({ node: last.node, text: 'Fim do fluxo.', tone: 'stop' });
  return steps;
}

export default function Simulator({ graph, options, onClose }: { graph: FlowGraph; options: EditorOptions | null; onClose: () => void }) {
  const [name, setName] = useState('Maria Souza');
  const [message, setMessage] = useState('Oi, quero um orçamento');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [steps, setSteps] = useState<SimStep[] | null>(null);
  const questions = useMemo(() => graph.nodes.filter((node) => node.type === 'question'), [graph]);

  return (
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
          {questions.map((question) => (
            <label key={question.id} className={styles.field}>
              <span>Resposta para &quot;{question.label}&quot; (vazio = não respondeu)</span>
              <input className={styles.input} value={answers[question.id] || ''} onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })} />
            </label>
          ))}
          <button type="button" className={styles.primaryBtn} onClick={() => setSteps(simulate(graph, options, { name, message, answers }))}>
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
                      <strong>{step.tone === 'stop' && step.text === 'Fim do fluxo.' ? 'Fim' : step.node.label}</strong>
                      <p>{step.text}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
