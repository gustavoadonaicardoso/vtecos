import { ArrowRight, Trash2, X } from "lucide-react";
import styles from "../automations.module.css";
import { CHANNELS, channelLabel } from "../constants";
import type { AutomationNode, AutomationProject, ChannelId, NodeConfig } from "../types";

interface NodeInspectorProps {
  selectedNode: AutomationNode;
  activeProject: AutomationProject;
  updateNode: (nodeId: string, updates: Partial<AutomationNode>) => void;
  updateNodeConfig: (nodeId: string, config: NodeConfig, content?: string) => void;
  insertVariable: (name: string) => void;
  deleteConnection: (connectionId: string) => void;
  deleteNode: (nodeId: string) => void;
}

export default function NodeInspector({ selectedNode, activeProject, updateNode, updateNodeConfig, insertVariable, deleteConnection, deleteNode }: NodeInspectorProps) {
  const channelOptions = activeProject.channels.length > 0 ? activeProject.channels : CHANNELS.map(channel => channel.id);
  const config = selectedNode.config;
  const setContent = (content: string) => updateNode(selectedNode.id, { content });

  return (
    <>
      <div className={styles.inspectorGroup}>
        <label>Nome do bloco</label>
        <input className={styles.inspectorInput} value={selectedNode.label} onChange={event => updateNode(selectedNode.id, { label: event.target.value })} />
      </div>
      <div className={styles.inspectorGroup}>
        <label>Resumo do bloco</label>
        <textarea className={styles.inspectorTextarea} value={selectedNode.content} onChange={event => setContent(event.target.value)} rows={3} />
      </div>

      {selectedNode.type.startsWith("trigger") && (
        <div className={styles.inspectorGroup}>
          <label>Evento de entrada</label>
          <select className={styles.inspectorInput} value={config.triggerEvent || "message_received"} onChange={event => updateNodeConfig(selectedNode.id, { triggerEvent: event.target.value })}>
            <option value="message_received">Mensagem recebida</option>
            <option value="lead_created">Novo lead criado</option>
            <option value="webhook_received">Webhook recebido</option>
            <option value="schedule">Agendamento recorrente</option>
          </select>
        </div>
      )}

      {(selectedNode.type === "send-message" || selectedNode.type === "send-media" || selectedNode.type === "question") && (
        <div className={styles.inspectorGroup}>
          <label>Canal de envio</label>
          <select className={styles.inspectorInput} value={config.channel || channelOptions[0]} onChange={event => updateNodeConfig(selectedNode.id, { channel: event.target.value as ChannelId })}>
            {channelOptions.map(channel => <option key={channel} value={channel}>{channelLabel(channel)}</option>)}
          </select>
          {activeProject.channels.length === 0 && <small className={styles.inspectorHint}>Nenhum canal foi ativado; selecione um canal na lateral.</small>}
        </div>
      )}

      {selectedNode.type === "send-message" && (
        <div className={styles.inspectorGroup}>
          <label>Mensagem</label>
          <textarea className={styles.inspectorTextarea} value={config.message || selectedNode.content} onChange={event => updateNodeConfig(selectedNode.id, { message: event.target.value }, event.target.value)} rows={5} />
        </div>
      )}

      {selectedNode.type === "send-media" && (
        <div className={styles.inspectorGroup}>
          <label>URL pública da mídia</label>
          <input className={styles.inspectorInput} value={config.mediaUrl || ""} placeholder="https://..." onChange={event => updateNodeConfig(selectedNode.id, { mediaUrl: event.target.value })} />
        </div>
      )}

      {selectedNode.type === "question" && (
        <>
          <div className={styles.inspectorGroup}>
            <label>Pergunta</label>
            <textarea className={styles.inspectorTextarea} value={config.question || selectedNode.content} onChange={event => updateNodeConfig(selectedNode.id, { question: event.target.value }, event.target.value)} rows={4} />
          </div>
          <div className={styles.inspectorGroup}>
            <label>Salvar resposta na variável</label>
            <input className={styles.inspectorInput} value={config.variable || "resposta"} onChange={event => updateNodeConfig(selectedNode.id, { variable: event.target.value })} placeholder="ex.: interesse" />
          </div>
        </>
      )}

      {selectedNode.type === "condition" && (
        <>
          <div className={styles.inspectorGroup}>
            <label>Campo ou variável</label>
            <input className={styles.inspectorInput} value={config.conditionField || ""} onChange={event => updateNodeConfig(selectedNode.id, { conditionField: event.target.value })} placeholder="ex.: lead.email" />
          </div>
          <div className={styles.inspectorGroup}>
            <label>Operador</label>
            <select className={styles.inspectorInput} value={config.conditionOperator || "exists"} onChange={event => updateNodeConfig(selectedNode.id, { conditionOperator: event.target.value })}>
              <option value="exists">Existe</option>
              <option value="equals">É igual a</option>
              <option value="contains">Contém</option>
              <option value="greater_than">É maior que</option>
              <option value="less_than">É menor que</option>
            </select>
          </div>
          <div className={styles.inspectorGroup}>
            <label>Valor de comparação</label>
            <input className={styles.inspectorInput} value={config.conditionValue || ""} onChange={event => updateNodeConfig(selectedNode.id, { conditionValue: event.target.value })} placeholder="Opcional" />
          </div>
          <div className={styles.branchLegend}><span><i className={styles.branchYes} /> Sim</span><span><i className={styles.branchNo} /> Não</span></div>
        </>
      )}

      {selectedNode.type === "delay" && (
        <div className={styles.inspectorGroup}>
          <label>Tempo de espera (minutos)</label>
          <input className={styles.inspectorInput} type="number" min="1" value={config.waitMinutes || 5} onChange={event => updateNodeConfig(selectedNode.id, { waitMinutes: Number(event.target.value) || 1 }, `Aguardar ${Number(event.target.value) || 1} minutos`)} />
        </div>
      )}

      {selectedNode.type === "update-lead" && (
        <>
          <div className={styles.inspectorGroup}>
            <label>Campo do lead</label>
            <select className={styles.inspectorInput} value={config.field || "status"} onChange={event => updateNodeConfig(selectedNode.id, { field: event.target.value })}>
              <option value="status">Status</option><option value="name">Nome</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="notes">Observações</option>
            </select>
          </div>
          <div className={styles.inspectorGroup}>
            <label>Novo valor</label>
            <input className={styles.inspectorInput} value={config.fieldValue || ""} onChange={event => updateNodeConfig(selectedNode.id, { fieldValue: event.target.value })} />
          </div>
        </>
      )}

      {selectedNode.type === "tag-lead" && (
        <div className={styles.inspectorGroup}>
          <label>Etiqueta</label>
          <input className={styles.inspectorInput} value={config.tag || ""} onChange={event => updateNodeConfig(selectedNode.id, { tag: event.target.value })} placeholder="ex.: cliente quente" />
        </div>
      )}

      {selectedNode.type === "webhook" && (
        <>
          <div className={styles.inspectorGroup}>
            <label>Método</label>
            <select className={styles.inspectorInput} value={config.method || "POST"} onChange={event => updateNodeConfig(selectedNode.id, { method: event.target.value })}><option>POST</option><option>PUT</option><option>GET</option></select>
          </div>
          <div className={styles.inspectorGroup}>
            <label>URL do endpoint</label>
            <input className={styles.inspectorInput} value={config.url || ""} placeholder="https://sua-api.com/webhook" onChange={event => updateNodeConfig(selectedNode.id, { url: event.target.value })} />
          </div>
        </>
      )}

      <div className={styles.variableInsert}>
        <div className={styles.inspectorSubheading}>Inserir variável</div>
        <div className={styles.variableChips}>
          {activeProject.variables.map(variable => (
            <button type="button" key={variable.id} onClick={() => insertVariable(variable.name)}>{`{{${variable.name}}}`}</button>
          ))}
        </div>
      </div>

      <div className={styles.connectionList}>
        <div className={styles.inspectorSubheading}>Conexões deste bloco</div>
        {activeProject.connections.filter(connection => connection.fromId === selectedNode.id || connection.toId === selectedNode.id).map(connection => {
          const otherId = connection.fromId === selectedNode.id ? connection.toId : connection.fromId;
          const other = activeProject.nodes.find(node => node.id === otherId);
          return (
            <div className={styles.connectionItem} key={connection.id}>
              <ArrowRight size={13} /> <span>{other?.label || "Bloco removido"}</span>
              <button type="button" onClick={() => deleteConnection(connection.id)} aria-label="Remover conexão"><X size={13} /></button>
            </div>
          );
        })}
        {activeProject.connections.filter(connection => connection.fromId === selectedNode.id || connection.toId === selectedNode.id).length === 0 && <small className={styles.inspectorHint}>Nenhuma conexão ainda.</small>}
      </div>

      <button type="button" className={styles.deleteNodeBtn} onClick={() => deleteNode(selectedNode.id)}><Trash2 size={15} /> Remover bloco</button>
    </>
  );
}
