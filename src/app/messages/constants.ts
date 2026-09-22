import type { MetaTemplate } from './types';

export const QUICK_MESSAGES = [
  "Olá! Como posso te ajudar hoje?",
  "Um momento, estou verificando seu pedido.",
  "Proposta enviada! Por favor, dê uma olhada no seu e-mail.",
  "Pode me confirmar o seu CPF para continuarmos?",
  "Obrigado por aguardar! O processo foi finalizado.",
];

export const META_TEMPLATES: MetaTemplate[] = [
  { id: 'welcome', name: "Boas-vindas (Official)", text: "Olá {{1}}, bem-vindo à Vórtice! Em que podemos ajudar hoje?" },
  { id: 'followup', name: "Follow-up", text: "Oi {{1}}, notamos seu interesse. Tem alguma dúvida pendente?" },
  { id: 'confirm', name: "Confirmação de Agendamento", text: "Seu agendamento para {{1}} está confirmado!" },
];

export const EMOJIS = ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👹", "👺", "🤡", "👻", "💀", "☠️", "👽", "👾", "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾"];

export const INITIAL_MESSAGES: Record<string, any[]> = {
  'lead-1': [
    { id: 1, type: 'text', text: 'Olá Mário! Já avaliou a proposta?', sent: true, time: '14:15' },
    { id: 2, type: 'text', text: 'Oi! Estou vendo agora.', sent: false, time: '14:18' },
    { id: 3, type: 'text', text: 'Ok, fechado! Mandarei os dados.', sent: false, time: '14:20' }
  ],
  'lead-2': [
    { id: 1, type: 'text', text: 'Pode me explicar como funciona a escala?', sent: false, time: '13:05' }
  ]
};

export const CHAT_TABS = ['Todos', 'Minhas Conversas', 'Aguardando', 'Grupos'];

export const CHANNEL_OPTIONS = ['WhatsApp', 'Instagram', 'Messenger', 'E-mail'];
