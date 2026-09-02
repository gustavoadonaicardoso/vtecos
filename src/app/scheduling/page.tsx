"use client";

import React, { useState, useEffect } from "react";
import styles from "./scheduling.module.css";
import { 
  Calendar, 
  Layout as KanbanIcon, 
  Send, 
  Plus, 
  Search, 
  Clock, 
  User, 
  ChevronLeft, 
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  X,
  Trash2,
  Loader2,
  Smartphone,
  Camera,
  MessageSquare,
  Mail
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";

interface UnifiedItem {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: "todo" | "in-progress" | "done";
  date: string;
  time?: string;
  type: "task" | "event";
  lead?: string;
}

interface ScheduledMessage {
  id: string;
  channel: string;
  lead_name: string;
  lead_id?: string;
  scheduled_date: string;
  scheduled_time: string;
  template_name: string;
  message: string;
  status: 'pending' | 'sent' | 'failed';
}

interface LeadOption {
  id: string;
  name: string;
}

const LOCAL_ITEMS_KEY = "vortice_scheduling_items";

const formatDateInput = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
);

const readLocalItems = (): UnifiedItem[] => {
  if (typeof window === "undefined") return [];

  try {
    const stored = JSON.parse(localStorage.getItem(LOCAL_ITEMS_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

const writeLocalItems = (nextItems: UnifiedItem[]) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(nextItems));
  }
};

const sortItems = (nextItems: UnifiedItem[]) => [...nextItems].sort((a, b) => (
  `${a.date}T${a.time || "23:59"}`.localeCompare(`${b.date}T${b.time || "23:59"}`)
));

const SchedulingPage = () => {
  const [activeTab, setActiveTab] = useState<"calendar" | "kanban" | "messages">("calendar");
  const [currentDate, setCurrentDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  
  // States
  const [items, setItems] = useState<UnifiedItem[]>([]);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<UnifiedItem | null>(null);
  const [tempItem, setTempItem] = useState<Partial<UnifiedItem>>({});

  // Message Form state
  const [msgFormData, setMsgFormData] = useState({
    channel: 'WhatsApp (Oficial)',
    lead_id: '',
    lead_name: '',
    date: formatDateInput(new Date()),
    time: '09:00',
    template: 'Boas-vindas Lead Novo',
    message: ''
  });

  // Fetch data on load
  useEffect(() => {
    setLoading(true);
    void Promise.all([
      fetchItems(),
      fetchScheduledMessages(),
      fetchLeads()
    ]).finally(() => setLoading(false));
  }, []);

  const fetchItems = async () => {
    const localItems = readLocalItems();
    setItems(sortItems(localItems));

    try {
      const { data, error } = await supabase
        .from("scheduling_items")
        .select("*")
        .order("date", { ascending: true });

      if (!error && data) {
        const remoteItems = sortItems(data as UnifiedItem[]);
        setItems(remoteItems);
        writeLocalItems(remoteItems);
      }
    } catch {
      // A agenda continua funcionando com o armazenamento local quando a tabela
      // ainda não foi criada ou a conexão remota não está disponível.
    }
  };

  const fetchScheduledMessages = async () => {
    try {
      const { data, error } = await supabase
        .from("scheduled_messages")
        .select("*")
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true });

      if (!error && data) setScheduledMessages(data as ScheduledMessage[]);
    } catch {
      setScheduledMessages([]);
    }
  };

  const fetchLeads = async () => {
    try {
      const { data, error } = await supabase.from("leads").select("id, name").order("name");
      if (!error && data) setLeads(data);
    } catch {
      setLeads([]);
    }
  };

  const openNewItem = (type: UnifiedItem["type"], date = new Date()) => {
    setEditingItem(null);
    setTempItem({
      title: "",
      description: "",
      priority: "medium",
      status: "todo",
      time: "09:00",
      date: formatDateInput(date),
      type,
      lead: ""
    });
    setIsModalOpen(true);
  };

  const getCalendarDefaultDate = () => {
    const today = new Date();
    return today.getFullYear() === currentDate.getFullYear() && today.getMonth() === currentDate.getMonth()
      ? today
      : currentDate;
  };

  const handleDayClick = (dateObj: { date: Date }) => {
    openNewItem("event", dateObj.date);
  };

  const handleItemClick = (e: React.MouseEvent, item: UnifiedItem) => {
    e.stopPropagation();
    setEditingItem(item);
    setTempItem({ ...item });
    setIsModalOpen(true);
  };

  const handleSaveItem = async () => {
    const title = tempItem.title?.trim();
    if (!title) {
      alert("Informe um título para a tarefa ou evento.");
      return;
    }

    const itemData = {
      title,
      description: tempItem.description?.trim() || "",
      priority: tempItem.priority || "medium",
      status: tempItem.status || "todo",
      date: tempItem.date || formatDateInput(new Date()),
      time: tempItem.time || "",
      type: tempItem.type || "event",
      lead: tempItem.lead?.trim() || ""
    };

    const nextItem: UnifiedItem = {
      id: editingItem?.id || `local-${Date.now()}`,
      ...itemData
    };
    const nextItems = sortItems(editingItem
      ? items.map(item => item.id === editingItem.id ? nextItem : item)
      : [...items, nextItem]
    );

    setItems(nextItems);
    writeLocalItems(nextItems);
    setIsModalOpen(false);
    setLoading(true);

    try {
      if (editingItem) {
        await supabase.from("scheduling_items").update(itemData).eq("id", editingItem.id);
      } else {
        await supabase.from("scheduling_items").insert([itemData]);
      }
    } catch {
      // O item já foi salvo localmente e permanece disponível sem o banco.
    }
    setLoading(false);
  };

  const handleDeleteItem = async () => {
    if (!editingItem) return;

    const nextItems = items.filter(item => item.id !== editingItem.id);
    setItems(nextItems);
    writeLocalItems(nextItems);
    setIsModalOpen(false);
    setLoading(true);

    try {
      await supabase.from("scheduling_items").delete().eq("id", editingItem.id);
    } catch {
      // O item já foi removido localmente.
    }
    setLoading(false);
  };

  const handleScheduleMessage = async () => {
    if (!supabase) return;
    if (!msgFormData.lead_name && !msgFormData.lead_id) {
       alert("Selecione um lead para o envio.");
       return;
    }

    setLoading(true);
    const { error } = await supabase.from("scheduled_messages").insert([{
      channel: msgFormData.channel,
      lead_id: msgFormData.lead_id || null,
      lead_name: msgFormData.lead_name || leads.find(l => l.id === msgFormData.lead_id)?.name || "Lead",
      scheduled_date: msgFormData.date,
      scheduled_time: msgFormData.time,
      template_name: msgFormData.template,
      message: msgFormData.message,
      status: 'pending'
    }]);

    if (!error) {
      alert("Mensagem agendada com sucesso!");
      setMsgFormData({ ...msgFormData, message: '', lead_id: '', lead_name: '' });
      await fetchScheduledMessages();
    } else {
      alert("Erro ao agendar: " + error.message);
    }
    setLoading(false);
  };


  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(currentDate);
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const todayStr = formatDateInput(new Date());
    
    const calendarDays = [];
    for (let i = firstDayOfMonth - 1; i >= 0; i--) calendarDays.push({ day: prevMonthLastDay - i, month: 'prev', date: new Date(year, month - 1, prevMonthLastDay - i) });
    for (let i = 1; i <= daysInMonth; i++) calendarDays.push({ day: i, month: 'current', date: new Date(year, month, i) });
    const remainingCells = 42 - calendarDays.length;
    for (let i = 1; i <= remainingCells; i++) calendarDays.push({ day: i, month: 'next', date: new Date(year, month + 1, i) });
    
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={styles.calendarContainer}>
        <div className={styles.calendarControl}>
          <div className={styles.monthDisplay}>
            <h2>{capitalizedMonth} {year}</h2>
            <div className={styles.navBtns}>
              <button className={styles.todayBtn} onClick={() => {
                const today = new Date();
                setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
              }}>Hoje</button>
              <button className={styles.iconBtn} onClick={() => setCurrentDate(new Date(year, month - 1, 1))}><ChevronLeft size={20} /></button>
              <button className={styles.iconBtn} onClick={() => setCurrentDate(new Date(year, month + 1, 1))}><ChevronRight size={20} /></button>
            </div>
          </div>
          <div className={styles.calendarActions}>
            <button className={styles.addTaskCalendarBtn} onClick={() => openNewItem("task", getCalendarDefaultDate())}>
              <Plus size={18} /> Nova tarefa
            </button>
            <button className={styles.addEventBtn} onClick={() => openNewItem("event", getCalendarDefaultDate())}>
              <Plus size={18} /> Novo evento
            </button>
          </div>
        </div>
        <div className={styles.calendarGrid}>
          {weekDays.map(day => <div key={day} className={styles.calendarDayHeader}>{day}</div>)}
          {calendarDays.map((dateObj, idx) => {
            const dateStr = formatDateInput(dateObj.date);
            const dayItems = items.filter(i => i.date === dateStr);
            return (
              <div key={idx} className={`${styles.calendarDay} ${styles.clickable} ${dateObj.month !== 'current' ? styles.otherMonth : ""} ${dateStr === todayStr ? styles.today : ""}`} onClick={() => handleDayClick(dateObj)}>
                <span className={styles.dayNumber}>{dateObj.day}</span>
                {dayItems.map(item => (
                  <div key={item.id} className={`${styles.event} ${item.type === 'task' ? styles.taskItem : ''} ${item.status === 'done' ? styles.itemDone : ''}`} onClick={(e) => handleItemClick(e, item)}>
                    <strong>{item.time ? item.time.slice(0, 5) : "Dia todo"}</strong>
                    <span>{item.title}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </motion.div>
    );
  };

  const renderKanban = () => {
    const columns = [
      { id: "todo", title: "Para Fazer", icon: <Clock size={18} /> },
      { id: "in-progress", title: "Em Execução", icon: <AlertCircle size={18} /> },
      { id: "done", title: "Finalizado", icon: <CheckCircle2 size={18} /> },
    ];
    return (
      <div className={styles.kanban}>
        {columns.map(col => (
          <div key={col.id} className={styles.column}>
            <div className={styles.columnHeader}>
              <div className={styles.colTitle}>{col.icon}<h3>{col.title}</h3></div>
              <span className={styles.taskCount}>{items.filter(i => i.status === col.id).length}</span>
            </div>
            <div className={styles.taskList}>
              {items.filter(i => i.status === col.id).map(item => (
                <div key={item.id} className={styles.taskCard} onClick={(e) => handleItemClick(e, item)}>
                  <div className={styles.taskHeader}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span className={`${styles.priority} ${item.priority === "high" ? styles.priorityHigh : item.priority === "medium" ? styles.priorityMedium : styles.priorityLow}`}>{item.priority}</span>
                      <span className={`${styles.typeTag} ${item.type === 'event' ? styles.typeEvent : styles.typeTask}`}>{item.type === 'event' ? 'Evento' : 'Tarefa'}</span>
                    </div>
                  </div>
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                  <div className={styles.taskMeta}>
                    <div className={styles.metaInfo}><Clock size={12} /> <span>{item.date} {item.time ? `@ ${item.time.slice(0, 5)}` : ''}</span></div>
                    {item.lead && <div className={styles.metaInfo}><User size={12} /> <span>{item.lead}</span></div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderMessageScheduler = () => {
    const pendingCount = scheduledMessages.filter(m => m.status === 'pending').length;
    const sentCount = scheduledMessages.filter(m => m.status === 'sent').length;

    return (
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className={styles.schedulerContent}>
        <div className={styles.scheduleForm}>
          <h3>Agendar Envio de Mensagem</h3>
          <p>Configure envios automáticos para seus leads via WhatsApp ou Messenger.</p>
          
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Canal de Envio</label>
              <select className={styles.select} value={msgFormData.channel} onChange={e => setMsgFormData({...msgFormData, channel: e.target.value})}>
                <option>WhatsApp (Oficial)</option>
                <option>Instagram DM</option>
                <option>Facebook Messenger</option>
                <option>E-mail Marketing</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Lead / Destinatário</label>
              <div className={styles.inputWithIcon}>
                <Search size={18} />
                <select className={styles.input} style={{ paddingLeft: '3.25rem' }} value={msgFormData.lead_id} onChange={e => setMsgFormData({...msgFormData, lead_id: e.target.value})}>
                  <option value="">Selecione um lead...</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Data de Envio</label>
              <input type="date" className={styles.input} value={msgFormData.date} onChange={e => setMsgFormData({...msgFormData, date: e.target.value})} />
            </div>

            <div className={styles.formGroup}>
              <label>Horário</label>
              <input type="time" className={styles.input} value={msgFormData.time} onChange={e => setMsgFormData({...msgFormData, time: e.target.value})} />
            </div>

            <div className={styles.formGroupFull}>
              <label>Modelo de Mensagem (Template)</label>
              <select className={styles.select} value={msgFormData.template} onChange={e => setMsgFormData({...msgFormData, template: e.target.value})}>
                <option>Boas-vindas Lead Novo</option>
                <option>Lembrete de Agendamento</option>
                <option>Apresentação de Orçamento</option>
                <option>Personalizado...</option>
              </select>
            </div>

            <div className={styles.formGroupFull}>
              <label>Mensagem</label>
              <textarea className={styles.textarea} rows={5} placeholder="Escreva sua mensagem aqui..." value={msgFormData.message} onChange={e => setMsgFormData({...msgFormData, message: e.target.value})}></textarea>
            </div>
          </div>
          
          <button className={styles.submitBtn} onClick={handleScheduleMessage} disabled={loading}>
            {loading ? <Loader2 className={styles.spinner} size={20} /> : <Send size={18} />}
            Agendar Disparo
          </button>
        </div>

        <div className={styles.sidebarInfo}>
          <div className={styles.infoCard}>
            <h4>Próximos Envios</h4>
            <div className={styles.pendingList}>
              {scheduledMessages.filter(m => m.status === 'pending').slice(0, 3).map(msg => (
                <div key={msg.id} className={styles.pendingItem}>
                  <div className={styles.pendingIcon}>
                    {msg.channel.includes('WhatsApp') ? <Smartphone size={14} /> : 
                     msg.channel.includes('Instagram') ? <Camera size={14} /> :
                     msg.channel.includes('Facebook') ? <MessageSquare size={14} /> : <Mail size={14} />}
                  </div>
                  <div className={styles.pendingDetails}>
                    <p><strong>{msg.lead_name}</strong></p>
                    <span>{msg.channel} - {msg.scheduled_date} às {msg.scheduled_time.slice(0, 5)}</span>
                  </div>
                </div>
              ))}
              {scheduledMessages.filter(m => m.status === 'pending').length === 0 && (
                <p style={{ opacity: 0.5, fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>Nenhum envio agendado.</p>
              )}
            </div>
          </div>

          <div className={styles.statsCard}>
            <div className={styles.stat}>
              <span className={styles.statVal}>{sentCount}</span> <span className={styles.statLabel}>Enviadas</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statVal}>{pendingCount}</span> <span className={styles.statLabel}>Agendadas</span>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleSection}>
          <h1>Gestão & Agendamento</h1>
          <p>Organize sua agenda, tarefas e automações em um só lugar.</p>
        </div>
        <div className={styles.headerActions}>
           <div className={styles.tabs}>
            <button className={`${styles.tab} ${activeTab === "calendar" ? styles.activeTab : ""}`} onClick={() => setActiveTab("calendar")}><Calendar size={18} /> Agenda</button>
            <button className={`${styles.tab} ${activeTab === "kanban" ? styles.activeTab : ""}`} onClick={() => setActiveTab("kanban")}><KanbanIcon size={18} /> Kanban</button>
            <button className={`${styles.tab} ${activeTab === "messages" ? styles.activeTab : ""}`} onClick={() => setActiveTab("messages")}><Send size={18} /> Mensagens</button>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        {loading && items.length === 0 && scheduledMessages.length === 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}><Loader2 className={styles.spinner} size={40} /></div>
        )}
        <AnimatePresence mode="wait">
          {activeTab === "calendar" && <div key="calendar">{renderCalendar()}</div>}
          {activeTab === "kanban" && <div key="kanban">{renderKanban()}</div>}
          {activeTab === "messages" && <div key="messages">{renderMessageScheduler()}</div>}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
            <motion.div className={styles.modal} onClick={e => e.stopPropagation()} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <div className={styles.modalHeader}><h2>{editingItem ? "Editar Item" : "Novo Item"}</h2><button className={styles.closeBtn} onClick={() => setIsModalOpen(false)}><X size={24} /></button></div>
              <div className={styles.modalBody}>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}><label>Tipo</label><select className={styles.select} value={tempItem.type || "task"} onChange={e => setTempItem({...tempItem, type: e.target.value as UnifiedItem["type"]})}><option value="task">Tarefa</option><option value="event">Evento</option></select></div>
                  <div className={styles.formGroup}><label>Prioridade</label><select className={styles.select} value={tempItem.priority || "medium"} onChange={e => setTempItem({...tempItem, priority: e.target.value as UnifiedItem["priority"]})}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></select></div>
                </div>
                <div className={styles.formGroup}><label>Título</label><input type="text" className={styles.input} value={tempItem.title || ""} onChange={e => setTempItem({...tempItem, title: e.target.value})} placeholder="Título da tarefa ou evento" /></div>
                <div className={styles.formGroup}><label>Descrição</label><textarea className={styles.textarea} value={tempItem.description || ""} onChange={e => setTempItem({...tempItem, description: e.target.value})} placeholder="Detalhes adicionais..." rows={3} /></div>
                <div className={styles.formGroup}><label>Status</label><select className={styles.select} value={tempItem.status || "todo"} onChange={e => setTempItem({...tempItem, status: e.target.value as UnifiedItem["status"]})}><option value="todo">Para Fazer</option><option value="in-progress">Em Execução</option><option value="done">Concluído</option></select></div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}><label>Data</label><input type="date" className={styles.input} value={tempItem.date || ""} onChange={e => setTempItem({...tempItem, date: e.target.value})} /></div>
                  <div className={styles.formGroup}><label>Horário</label><input type="time" className={styles.input} value={tempItem.time || ""} onChange={e => setTempItem({...tempItem, time: e.target.value})} /></div>
                </div>
                <div className={styles.formGroup}><label>Lead / Responsável</label><input type="text" className={styles.input} value={tempItem.lead || ""} onChange={e => setTempItem({...tempItem, lead: e.target.value})} placeholder="Nome do lead ou membro" /></div>
              </div>
              <div className={styles.modalFooter}>
                {editingItem && <button className={styles.deleteBtn} onClick={handleDeleteItem} disabled={loading}><Trash2 size={18} /> Excluir</button>}
                <button className={styles.cancelBtn} onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button className={styles.saveBtn} onClick={handleSaveItem} disabled={loading}>{loading ? 'Salvando...' : (editingItem ? "Salvar" : "Adicionar")}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SchedulingPage;
