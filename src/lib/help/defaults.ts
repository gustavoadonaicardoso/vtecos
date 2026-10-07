/**
 * ============================================================
 * VTEC OS — Conteúdo padrão da Central de Ajuda
 * ============================================================
 * Gravado no banco na primeira vez que alguém abre a Ajuda (e pelo botão
 * "Adicionar artigos padrão que faltam" no Painel Master). Depois disso,
 * quem manda é o banco: tudo é editável no Master > Central de Ajuda.
 *
 * Formatação do texto das seções: parágrafos separados por linha em
 * branco, listas com "- ", **negrito**, `código`, blocos ``` e links.
 * {{APP_URL}} vira o endereço do sistema (ex.: https://app.suaempresa.com).
 * ============================================================
 */

export interface HelpSection {
  title: string;
  text: string;
}

export interface DefaultCategory {
  slug: string;
  title: string;
  description: string;
  icon: string;
  color: string;
}

export interface DefaultArticle {
  slug: string;
  category: string;
  title: string;
  summary: string;
  sections: HelpSection[];
  tip?: string;
}

export interface DefaultFaq {
  question: string;
  answer: string;
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { slug: 'primeiros-passos', title: 'Primeiros passos', description: 'O básico para começar a usar o sistema com a sua equipe.', icon: 'rocket', color: '#3b82f6' },
  { slug: 'atendimento', title: 'CRM e atendimento', description: 'Leads, funil, mensagens do WhatsApp, disparos e automações.', icon: 'message', color: '#10b981' },
  { slug: 'integracoes', title: 'Integrações', description: 'Passo a passo para conectar WhatsApp, webhooks, formulários e planilhas.', icon: 'plug', color: '#8b5cf6' },
  { slug: 'redes-sociais', title: 'Redes sociais', description: 'Conectar Instagram e Facebook, agendar e aprovar posts.', icon: 'share', color: '#e4405f' },
  { slug: 'financeiro', title: 'Custos e precificação', description: 'Insumos, fichas técnicas, preço por canal e resultado.', icon: 'calculator', color: '#f59e0b' },
  { slug: 'senhas', title: 'Senhas, totem e TV', description: 'Fila de atendimento presencial com totem e painel de chamada.', icon: 'ticket', color: '#06b6d4' },
  { slug: 'gestao', title: 'Gestão e planejamento', description: 'Metas, relatórios, projetos, planejamentos e agenda.', icon: 'target', color: '#6366f1' },
  { slug: 'conta', title: 'Equipe, conta e segurança', description: 'Usuários, permissões, senha e auditoria.', icon: 'shield', color: '#ef4444' },
];

export const DEFAULT_ARTICLES: DefaultArticle[] = [
  // ── Primeiros passos ───────────────────────────────────────
  {
    slug: 'primeiros-passos',
    category: 'primeiros-passos',
    title: 'Primeiros passos no vtec os',
    summary: 'O que fazer no primeiro dia para deixar o sistema pronto para a equipe.',
    sections: [
      { title: '1. Complete seu perfil', text: 'Clique no seu nome no rodapé do menu (ou em **Configurações**) e envie uma foto, confira o nome e o telefone. A foto aparece no chat interno e na equipe.' },
      { title: '2. Revise os dados da empresa', text: 'Administradores: em **Configurações > Dados da empresa**, preencha nome, CNPJ, telefone e endereço. O nome aparece no totem, na TV de senhas e nas mensagens de chamada.' },
      { title: '3. Cadastre a equipe', text: 'Em **Equipe**, clique em novo membro, escolha o cargo (Administrador, Gerente ou Vendedor) e defina uma senha inicial. Cada pessoa troca a própria senha depois em Configurações > Senha e segurança.' },
      { title: '4. Conecte o WhatsApp', text: 'Em **Integrações**, escolha **WhatsApp Web** (QR Code, sem custo) ou **WhatsApp Business API** (oficial da Meta). As mensagens dos clientes passam a chegar em **Mensagens** e viram leads automaticamente.' },
      { title: '5. Ajuste o funil', text: 'Em **Pipeline**, revise as etapas do funil de vendas. Os leads novos entram sempre na primeira etapa.' },
      { title: '6. Ative os avisos', text: 'Em **Configurações > Notificações**, permita as notificações do navegador e escolha se quer som e pop-up para mensagens novas.' },
    ],
    tip: 'Os módulos que aparecem no menu dependem do plano da sua empresa. Para ver o que está incluído, um administrador abre Configurações > Plano e módulos.',
  },
  {
    slug: 'configuracoes-da-conta',
    category: 'primeiros-passos',
    title: 'Perfil, senha e notificações',
    summary: 'Como trocar foto, senha e escolher os avisos de cada aparelho.',
    sections: [
      { title: 'Foto e nome', text: 'Em **Configurações > Meu perfil**, clique em **Enviar foto** (JPG, PNG ou GIF até 5 MB; ela é cortada em quadrado). Altere nome e telefone e clique em **Salvar perfil**.' },
      { title: 'Trocar a senha', text: 'Em **Configurações > Senha e segurança**, informe a senha atual e a nova (mínimo de 8 caracteres) duas vezes. Esqueceu a atual? Use **Avisar os administradores** ou o link **Esqueceu a senha?** na tela de login: os administradores da empresa recebem um aviso no sino para definir uma nova.' },
      { title: 'Notificações', text: 'Em **Configurações > Notificações**:\n\n- **Permitir** libera as notificações do navegador neste aparelho.\n- **Enviar teste** confere se o computador está mostrando os avisos.\n- Som e pop-up de mensagens do WhatsApp e pop-up dos avisos do sistema podem ser ligados ou desligados por aparelho.\n\nCom o sistema aberto na tela, os avisos aparecem no canto superior direito; em segundo plano, na central de notificações do computador.' },
      { title: 'Notificação não aparece no Mac', text: 'Abra **Ajustes do Sistema > Notificações > Google Chrome** e ative "Permitir notificações" (estilo Faixas ou Alertas). Confira também se o modo Foco / Não perturbe está desligado.' },
      { title: 'Tema claro ou escuro', text: 'Use o ícone de lua/sol no topo da tela (ou o botão no canto da tela de login). A escolha fica salva no navegador.' },
    ],
  },

  // ── CRM e atendimento ──────────────────────────────────────
  {
    slug: 'gestao-de-leads',
    category: 'atendimento',
    title: 'Leads e funil de vendas',
    summary: 'Como os leads chegam, como mover no funil e acompanhar cada cliente.',
    sections: [
      { title: 'De onde vêm os leads', text: '- Cadastro manual pelo botão de novo lead.\n- Mensagem nova no WhatsApp de um número desconhecido.\n- Formulário do site ou outro sistema (Integrações > Captura de leads).\n- Retirada de senha no totem com telefone informado.\n\nTodo lead novo entra na primeira etapa do funil.' },
      { title: 'Pipeline (funil)', text: 'Em **Pipeline**, arraste o cartão do lead entre as etapas. Cada coluna mostra quantos leads e quanto valor há nela; o relógio do cartão diz há quantos dias o lead está na etapa (amarelo a partir de 7 dias, vermelho a partir de 30). Clique no cartão para ver e editar o lead. O botão **Lead nesta etapa** já cadastra na coluna certa. Busque e filtre por responsável ou etiqueta no topo.' },
      { title: 'Etapas', text: 'Administradores e gerentes criam, renomeiam, mudam a cor e reordenam as etapas (menu ⋮ da coluna ou arrastando a coluna). Ao excluir uma etapa, os leads dela vão para a primeira etapa. A etapa **Ganhos** não pode ser excluída: metas, relatórios e o Início usam ela.' },
      { title: 'Visão de funil', text: 'O botão **Funil** mostra quantos leads e quanto valor há em cada etapa, a média de dias na etapa, o valor em aberto e a conversão (ganhos sobre o total).' },
      { title: 'Detalhes do lead', text: 'Em **Leads**, clique no lead para abrir o painel: dá para editar telefone, e-mail, CPF/CNPJ, valor, etapa, responsável, etiquetas e observações, ver a origem e a última mensagem e abrir a conversa. Vendedores veem e editam só os próprios leads; gerentes e administradores veem todos.' },
      { title: 'Novo lead', text: 'O botão **Novo lead** pede nome e telefone (o resto é opcional). Se o telefone já estiver cadastrado, o sistema avisa e oferece abrir o lead existente, para não duplicar.' },
      { title: 'Filtros e busca', text: 'Busque por nome, telefone (com ou sem pontuação), e-mail ou etiqueta. Os atalhos do topo mostram os novos em 7 dias, os sem responsável e os bloqueados; os filtros separam por etapa, responsável, etiqueta e origem.' },
      { title: 'Ações em vários leads', text: 'Marque os leads na lista para mudar a etapa, trocar o responsável, pôr ou tirar etiqueta, bloquear ou excluir de uma vez.' },
      { title: 'Etiquetas', text: 'Em **Etiquetas** (administradores e gerentes), crie etiquetas com cor para organizar por interesse, temperatura ou campanha. Renomear ou apagar uma etiqueta vale para todos os leads que a usam. Etiquetas digitadas no lead entram no cadastro automaticamente.' },
      { title: 'Bloquear contato', text: 'Marque **Bloquear contato** no painel do lead para spam ou quem pediu para não receber mensagens: as automações deixam de rodar para ele.' },
      { title: 'Exportar', text: 'O botão **Exportar** baixa os leads da lista (com os filtros aplicados) em uma planilha CSV que abre no Excel.' },
    ],
  },
  {
    slug: 'mensagens-whatsapp',
    category: 'atendimento',
    title: 'Mensagens do WhatsApp',
    summary: 'Atender clientes pelo WhatsApp dentro do sistema.',
    sections: [
      { title: 'Antes de começar', text: 'Conecte um WhatsApp em **Integrações** (WhatsApp Web ou WhatsApp Business API).' },
      { title: 'Caixa de entrada', text: 'Em **Mensagens**, cada conversa é um lead e a lista fica na ordem da última mensagem. O número verde mostra quantas mensagens do cliente ainda não foram vistas -- zera quando alguém da equipe abre a conversa ou responde. As abas separam **Não lidas**, **Minhas** e (para gerentes) **Sem responsável**. Vendedores veem só as conversas deles.' },
      { title: 'Responder', text: 'Escreva e aperte Enter (Shift+Enter quebra linha). Dá para mandar emoji, arquivo, imagem e áudio (botão do microfone). A mensagem sai pelo WhatsApp conectado -- WhatsApp Web, se estiver conectado; senão, a API oficial. Se não sair, ela fica marcada em vermelho com **Tentar de novo**.' },
      { title: 'Respostas rápidas', text: 'O botão de documento abre as respostas rápidas. Use `{{primeiro_nome}}`, `{{nome}}` e `{{atendente}}` no texto para personalizar. Administradores e gerentes criam e editam em **Gerenciar**; quem pode usar cada uma é definido em **Equipe > Acessos**.' },
      { title: 'Assinatura', text: 'O botão de caneta coloca seu nome em negrito no topo de cada mensagem, para o cliente saber quem está atendendo. A escolha fica salva no seu navegador.' },
      { title: 'Transferir atendimento', text: 'O botão **Transferir** passa a conversa para outra pessoa da equipe, com um recado opcional. Ela recebe um aviso no sino com o link da conversa.' },
      { title: 'Janela de 24 horas (API oficial)', text: 'Na WhatsApp Business API, a Meta só deixa enviar mensagem livre até 24 horas depois da última mensagem do cliente. Fora disso, use um **template aprovado** (em Disparos).' },
    ],
  },
  {
    slug: 'disparos',
    category: 'atendimento',
    title: 'Disparos (campanhas de WhatsApp)',
    summary: 'Campanhas para uma planilha ou para leads do CRM, enviadas pelo servidor no ritmo e no horário escolhidos.',
    sections: [
      { title: 'Criar uma campanha', text: 'Em **Disparos > Nova campanha**, siga os passos:\n\n1. **Público**: envie uma planilha (CSV ou Excel, a primeira linha com os nomes das colunas) e marque a coluna do telefone, ou escolha **Leads do CRM** filtrando por etapa, etiqueta, responsável e data de cadastro.\n2. **Mensagem**: escreva o texto com variáveis (cada coluna da planilha vira uma, ex.: `{{cupom}}`), adicione variações e um anexo, e envie um teste para o seu WhatsApp.\n3. **Envio**: comece agora, agende ou salve como rascunho; escolha o ritmo, o horário comercial e o limite por dia.\n4. **Revisar** e iniciar.' },
      { title: 'O envio', text: 'O servidor manda uma mensagem por vez, com um intervalo sorteado, mesmo com o sistema fechado. Fora do horário de envio ou depois do limite do dia, a campanha espera e continua sozinha. Uma campanha por vez por empresa: as outras ficam na fila. Se o WhatsApp desconectar ou houver 5 falhas seguidas, a campanha pausa e quem criou é avisado no sino.' },
      { title: 'Acompanhar', text: 'No painel da campanha você vê enviadas, fila, respostas, falhas, quem foi pulado (telefone inválido, repetido ou descadastrado) e a previsão de término. Dá para pausar, retomar, cancelar, reenviar as falhas e duplicar.' },
      { title: 'Respostas e descadastro', text: 'Quem responde em até 7 dias pode ir para uma pessoa ou etapa, ganhar uma etiqueta e entrar numa automação. Quem responde **SAIR** (ou "parar", "não quero mais") entra em **Descadastrados** e nunca mais recebe campanhas. Deixe o rodapé de saída ligado.' },
      { title: 'API oficial da Meta', text: 'Pela API oficial, campanhas usam um **template aprovado** pela Meta; preencha cada variável do template com o que quiser (ex.: `{{lead.first_name}}`). A Meta cobra por conversa iniciada pela empresa.' },
      { title: 'Cuidados', text: '- No **WhatsApp Web**, use o ritmo **Segura**, horário comercial e um limite por dia, principalmente em números novos.\n- Envie só para quem conhece sua empresa: muitas denúncias de spam bloqueiam o número.' },
    ],
    tip: 'O envio automático depende do agendador do servidor (CONTENT_SCHEDULER_ENABLED=true).',
  },
  {
    slug: 'automacoes',
    category: 'atendimento',
    title: 'Automações',
    summary: 'Fluxos que rodam sozinhos: menus no WhatsApp, perguntas, IA, distribuição de leads, tarefas, webhooks e gatilhos por tempo.',
    sections: [
      { title: 'Como funciona', text: 'Cada fluxo começa com um **gatilho** e segue os blocos ligados a ele. Os fluxos rodam no servidor, mesmo com ninguém logado. Um fluxo novo nasce como **Rascunho** e só roda depois de **Ativar**. Comece por um dos modelos prontos (menu de atendimento, qualificação, distribuição de leads, lead parado, atendente com IA...).' },
      { title: 'Gatilhos', text: '- **Mensagem recebida**: qualquer mensagem, com palavras-chave ou exatamente igual a uma palavra; dá para limitar a contatos novos.\n- **Lead novo**: WhatsApp, formulário do site, cadastro manual, totem ou outro sistema.\n- **Lead entrou na etapa**: o lead é movido para uma etapa do funil.\n- **Etiqueta adicionada**: alguém (ou outra automação) põe uma etiqueta no lead.\n- **Lead parado**: conversa parada há X horas (cliente sem responder, cliente esperando a equipe ou qualquer uma).\n- **Data e hora marcadas**: todo dia, de segunda a sexta, toda semana, todo mês ou uma vez, para os leads de uma etapa ou etiqueta.\n- **Chamada de outro sistema**: um endereço próprio do fluxo para Make, Zapier, n8n, site ou ERP; acha ou cria o lead pelo telefone.\n- **Iniciado pela equipe**: só roda quando alguém clica em **Rodar** e escolhe os leads.\n\n**Não repetir por** e **Máximo por lead** evitam que o mesmo contato receba o fluxo várias vezes.' },
      { title: 'Blocos de conversa', text: '- **Enviar mensagem**: com até 5 variações sorteadas e "digitando..." antes (WhatsApp Web).\n- **Enviar arquivo**: imagem, vídeo, áudio ou documento, enviado do computador ou por link.\n- **Fazer pergunta**: confere o tipo da resposta (número, e-mail, telefone, CPF, CNPJ, data, sim/não), pede de novo quando vem errado e pode salvar direto no lead.\n- **Menu de opções**: opções numeradas (ou botões/lista na API oficial), uma saída para cada opção, mais "Opção inválida" e "Sem resposta".\n- **Aguardar resposta**: espera o contato responder.' },
      { title: 'Blocos de lógica', text: '- **Condição**: várias regras com E/OU (contém, é igual, começa com, maior/menor que, tem valor...).\n- **Dividir por valor**: vários caminhos conforme um valor.\n- **Horário de atendimento**: dentro ou fora do expediente de cada dia.\n- **Teste A/B**: sorteia entre dois caminhos.\n- **Aguardar**: por um tempo ou até um horário (opcionalmente só em dia útil).\n- **Guardar valor**: define, junta texto, soma ou subtrai.\n- **Iniciar outro fluxo** e **Encerrar fluxo** (que pode cancelar as outras automações do contato).' },
      { title: 'Blocos de CRM, equipe e IA', text: '- **Atualizar lead**, **Etiqueta** (pôr ou tirar), **Anotar no lead**.\n- **Distribuir lead**: rodízio, quem tem menos leads ou uma pessoa fixa.\n- **Criar tarefa**: aparece na Agenda e avisa no prazo.\n- **Avisar a equipe**: no sino e, se quiser, pelo WhatsApp de cada pessoa.\n- **Chamar webhook**: GET/POST/PUT/PATCH, cabeçalhos, corpo personalizado e campos da resposta guardados em variáveis; saídas **Sucesso** e **Erro**.\n- **Resposta com IA** e **Classificar com IA**: a IA responde uma mensagem seguindo as suas instruções ou escolhe o caminho pela intenção do cliente (precisa da IA configurada no servidor: a chave do Gemini ou a IA local).' },
      { title: 'Atendente com IA', text: 'O bloco **Atendente com IA** conversa com o cliente do começo ao fim, sem você montar pergunta por pergunta. Use o modelo **Atendente com IA** para começar.\n\n- **Instruções**: escreva o que a empresa faz, produtos, preços que podem ser ditos, horários, endereço e o que a IA não pode prometer. Quanto mais completo, melhor.\n- **Juntar mensagens**: espera alguns segundos depois da última mensagem e responde tudo de uma vez (quem manda "oi" e logo "quanto custa?" recebe uma resposta só). O que chega enquanto a IA pensa entra na próxima resposta.\n- **Fica quieta quando a equipe responde**: se alguém responde pelo sistema ou pelo celular conectado, a IA para por algumas horas (você escolhe; 0 = continua respondendo).\n- **Passar para a equipe**: quando o cliente pede uma pessoa, quer reclamar ou a IA não sabe responder, ela manda a sua mensagem de aviso, fica em silêncio e segue pela saída **Pediu atendente** (ligue em **Distribuir lead** e **Avisar a equipe**).\n- **Cliente parou de responder**: depois do tempo sem resposta, a conversa encerra por essa saída.\n- Em **Mensagens**, o botão **Pausar IA** cala a IA naquela conversa até alguém clicar em **Retomar IA**.\n\nNo gatilho **Mensagem recebida**, deixe **Não repetir por** em **0**: assim, quando uma conversa termina, a próxima mensagem do cliente já abre outra.' },
      { title: 'Variáveis', text: 'Clique em **Inserir variável** em qualquer texto. Há dados do contato (`{{lead.first_name}}`, `{{lead.value}}`, `{{lead.days_in_stage}}`...), da empresa (`{{empresa}}`, `{{empresa.telefone}}`), de data e hora (`{{saudacao}}`, `{{data.hoje}}`, `{{hora.agora}}`), os valores guardados pelos blocos do fluxo e, no gatilho de outro sistema, os dados recebidos (`{{entrada.pedido}}`). Use `{{lead.first_name|cliente}}` para ter um texto padrão quando o valor estiver vazio.' },
      { title: 'Montar no editor', text: 'Clique em **+ Bloco** para adicionar (ele já se liga ao bloco selecionado). Para ligar à mão, clique na bolinha da direita de uma saída e depois no bloco de destino. Clique numa ligação para removê-la. Tudo é salvo automaticamente.' },
      { title: 'Testar e ativar', text: 'Use **Simular** para ver o caminho e as mensagens sem enviar nada (dá para escolher respostas, horário, resultado da IA e do webhook). O botão de problemas mostra o que falta corrigir; só dá para **Ativar** um fluxo sem problemas. Em **Execuções** você vê cada contato que passou pelo fluxo, passo a passo, e pode cancelar uma execução que está esperando.' },
    ],
    tip: 'Esperas, prazos de resposta, lead parado, data e hora marcadas e a fila de "Rodar" dependem do agendador do servidor (CONTENT_SCHEDULER_ENABLED=true). Somente administradores e gerentes criam e editam fluxos.',
  },

  // ── Integrações (os mesmos textos aparecem dentro de Integrações) ──
  {
    slug: 'integracao-whatsapp-web',
    category: 'integracoes',
    title: 'WhatsApp Web (QR Code)',
    summary: 'Conecte o WhatsApp da empresa lendo um QR Code, sem custo de API.',
    sections: [
      { title: 'Gere o QR Code', text: 'Em **Integrações > WhatsApp Web**, clique em **Gerar QR Code**. Só administradores veem o código.' },
      { title: 'Leia com o celular', text: 'No celular da empresa, abra o WhatsApp e vá em **Configurações (ou ⋮) > Aparelhos conectados > Conectar um aparelho**. Aponte a câmera para o QR Code da tela.' },
      { title: 'Confirme a conexão', text: 'Em alguns segundos o status muda para **Conectado** e aparece o número. A partir daí as mensagens chegam em **Mensagens** e as respostas saem por esse número.' },
      { title: 'Boas práticas', text: '- O celular pode ficar desligado, mas entre no WhatsApp dele de vez em quando para manter a sessão ativa.\n- Esta conexão não é a API oficial da Meta: evite disparos em massa para não ter o número bloqueado.\n- Para trocar de número, clique em **Desconectar** e gere um novo QR Code.' },
    ],
    tip: 'Se o QR Code expirar antes da leitura, clique em Gerar QR Code de novo.',
  },
  {
    slug: 'integracao-whatsapp-api',
    category: 'integracoes',
    title: 'WhatsApp Business API (oficial da Meta)',
    summary: 'Conexão oficial pela Meta: mais estável, com templates aprovados e sem risco de bloqueio por uso normal.',
    sections: [
      { title: '1. Crie o app na Meta', text: 'Acesse https://developers.facebook.com, clique em **Meus apps > Criar app**, escolha o tipo **Empresa** e vincule ao portfólio empresarial (Business Manager). No painel do app, adicione o produto **WhatsApp**.' },
      { title: '2. Pegue os identificadores', text: 'Em **WhatsApp > Configuração da API**, copie:\n\n- **Identificação do número de telefone** (Phone Number ID)\n- **Identificação da conta do WhatsApp Business** (WABA ID)\n\nPara usar o seu número real, clique em **Adicionar número de telefone** e siga a verificação por SMS.' },
      { title: '3. Gere o token permanente', text: 'No Business Manager (https://business.facebook.com), vá em **Configurações do negócio > Usuários > Usuários do sistema**, crie um usuário **Admin**, clique em **Gerar novo token**, escolha o app e marque `whatsapp_business_messaging` e `whatsapp_business_management`. Copie o token (começa com EAA). Atribua também o app e a conta do WhatsApp a esse usuário em **Adicionar ativos**.' },
      { title: '4. Copie a chave secreta do app', text: 'No painel do app, **Configurações do app > Básico > Chave secreta do app > Mostrar**. Ela valida que as mensagens recebidas vieram mesmo da Meta.' },
      { title: '5. Salve e teste no vtec os', text: 'Em **Integrações > WhatsApp Business API**, cole token, Phone Number ID, WABA ID e chave secreta, clique em **Salvar** e depois em **Testar conexão**. O teste mostra o número e o nome verificado.' },
      { title: '6. Configure o webhook', text: 'No app da Meta, **WhatsApp > Configuração > Webhook > Editar**:\n\n- **URL de callback**: `{{APP_URL}}/api/webhooks/meta`\n- **Verificar token**: o token mostrado na tela de Integrações (é único da sua empresa)\n\nClique em **Verificar e salvar** e, em **Campos do webhook**, assine `messages`.' },
      { title: '7. Pronto', text: 'Mande uma mensagem para o número: ela aparece em **Mensagens** e o contato vira lead.' },
    ],
    tip: 'Ao editar a integração depois, deixe os campos de token e chave secreta em branco para manter os valores já salvos.',
  },
  {
    slug: 'integracao-webhooks',
    category: 'integracoes',
    title: 'Webhooks (enviar eventos para outros sistemas)',
    summary: 'Avise outro sistema (Make, Zapier, n8n, ERP) sempre que chegar um lead ou uma mensagem.',
    sections: [
      { title: '1. Tenha uma URL que receba POST', text: 'Pode ser um "Webhook personalizado" do Make, um "Catch Hook" do Zapier, um nó Webhook do n8n ou uma rota do seu sistema. Use **https**.' },
      { title: '2. Configure no vtec os', text: 'Em **Integrações > Webhooks**, cole a URL, escolha os eventos e clique em **Salvar**. Um segredo é gerado para assinar os envios (você pode trocar).' },
      { title: '3. Teste', text: 'Clique em **Enviar teste**: o sistema manda um evento `test` e mostra a resposta da sua URL. A última entrega também fica registrada na tela.' },
      { title: 'Eventos e formato', text: '- `lead.created`: lead novo (manual, WhatsApp, formulário ou totem).\n- `message.received`: mensagem nova de cliente no WhatsApp.\n\nCorpo (JSON):\n\n```\n{\n  "event": "lead.created",\n  "sent_at": "2026-10-08T12:00:00.000Z",\n  "data": { "id": "...", "name": "Maria", "phone": "5511999999999", "email": "maria@email.com", "value": 0, "source": "whatsapp", "created_at": "..." }\n}\n```' },
      { title: 'Validar a origem (opcional)', text: 'Cada envio traz o cabeçalho `X-Vtec-Signature: sha256=<assinatura>`, que é o HMAC-SHA256 do corpo com o seu segredo, e `X-Vtec-Event` com o nome do evento. Recalcule no seu sistema e compare para ter certeza de que veio do vtec os.' },
    ],
  },
  {
    slug: 'integracao-captura-leads',
    category: 'integracoes',
    title: 'Captura de leads (site e formulários)',
    summary: 'Receba leads do formulário do seu site, landing page ou de outro sistema direto no funil.',
    sections: [
      { title: '1. Gere a chave', text: 'Em **Integrações > Captura de leads**, clique em **Gerar chave**. O endereço completo (com a chave) aparece na tela com botão de copiar. Quem tiver o endereço consegue criar leads: se vazar, clique em **Gerar nova chave** (a antiga para de funcionar na hora).' },
      { title: '2. Campos aceitos', text: '- `name` (obrigatório)\n- `phone`\n- `email`\n- `value` (valor estimado)\n- `message` (aparece como última mensagem do lead na lista)\n- `redirect` (só em formulário HTML: página para onde a pessoa vai depois de enviar)' },
      { title: 'Formulário HTML', text: 'Cole no seu site trocando SUA_CHAVE:\n\n```\n<form action="{{APP_URL}}/api/webhooks/leads?key=SUA_CHAVE" method="POST">\n  <input name="name" placeholder="Nome" required>\n  <input name="phone" placeholder="WhatsApp">\n  <input name="email" type="email" placeholder="E-mail">\n  <input type="hidden" name="redirect" value="https://seusite.com.br/obrigado">\n  <button type="submit">Quero falar com vocês</button>\n</form>\n```' },
      { title: 'Por API / automação', text: 'Envie um POST com JSON:\n\n```\ncurl -X POST "{{APP_URL}}/api/webhooks/leads?key=SUA_CHAVE" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"name":"Maria","phone":"11999999999","email":"maria@email.com"}\'\n```\n\nA resposta traz o `id` do lead criado.' },
      { title: 'O que acontece depois', text: 'O lead entra na primeira etapa do funil, com origem "formulário", e dispara os **Webhooks** e o **Google Sheets** que estiverem configurados.' },
    ],
  },
  {
    slug: 'integracao-google-sheets',
    category: 'integracoes',
    title: 'Google Sheets (planilha de leads)',
    summary: 'Cada lead novo vira uma linha na sua planilha do Google, sem precisar de API paga.',
    sections: [
      { title: '1. Abra o Apps Script da planilha', text: 'Abra (ou crie) a planilha no Google Sheets e vá em **Extensões > Apps Script**.' },
      { title: '2. Cole o código', text: 'Apague o conteúdo do editor, cole o código abaixo e clique em **Salvar**:\n\n```\nfunction doPost(e) {\n  var data = JSON.parse(e.postData.contents);\n  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];\n  if (sheet.getLastRow() === 0) {\n    sheet.appendRow([\'Data\', \'Nome\', \'Telefone\', \'E-mail\', \'Valor\', \'Origem\']);\n  }\n  sheet.appendRow([data.created_at, data.name, data.phone, data.email, data.value, data.source]);\n  return ContentService.createTextOutput(JSON.stringify({ ok: true }))\n    .setMimeType(ContentService.MimeType.JSON);\n}\n```' },
      { title: '3. Publique como app da Web', text: 'Clique em **Implantar > Nova implantação**, tipo **App da Web**:\n\n- Executar como: **Eu**\n- Quem pode acessar: **Qualquer pessoa**\n\nClique em **Implantar**, autorize com a sua conta Google e copie a **URL do app da Web** (termina em `/exec`).' },
      { title: '4. Conecte no vtec os', text: 'Em **Integrações > Google Sheets**, cole a URL, clique em **Salvar** e depois em **Enviar teste**: uma linha "Teste do vtec os" aparece na planilha.' },
      { title: 'Alterou o código?', text: 'Depois de mudar o script, use **Implantar > Gerenciar implantações > Editar > Nova versão** para a URL continuar a mesma.' },
    ],
  },

  // ── Redes sociais ──────────────────────────────────────────
  {
    slug: 'conectar-redes-sociais',
    category: 'redes-sociais',
    title: 'Conectar Instagram e Facebook',
    summary: 'Criar o app da Meta, conectar as contas e agendar posts.',
    sections: [
      { title: '1. Prepare as contas', text: 'O Instagram precisa ser uma conta profissional (Empresa ou Criador de conteúdo) e estar vinculado a uma Página do Facebook. No app do Instagram: **Configurações > Tipo de conta e ferramentas**, e depois **Central de Contas** para vincular à Página.' },
      { title: '2. Crie o app na Meta', text: 'Em https://developers.facebook.com, clique em **Criar app**, escolha o tipo **Empresa** e vincule ao portfólio empresarial (Business Manager).' },
      { title: '3. Adicione os produtos', text: 'No painel do app, adicione **Login do Facebook para Empresas** e **Instagram** (API com login do Facebook).' },
      { title: '4. Endereço de retorno', text: 'Em **Login do Facebook > Configurações**, adicione em "URIs de redirecionamento do OAuth válidos": `{{APP_URL}}/api/social/oauth/callback`.' },
      { title: '5. Dados básicos', text: 'Em **Configurações do app > Básico**, informe a URL da Política de Privacidade (`{{APP_URL}}/politica-de-privacidade`), um ícone e a categoria. Copie o **ID do app** e a **Chave secreta do app**.' },
      { title: '6. Configure o servidor', text: 'No arquivo `.env.local` do servidor adicione `META_APP_ID`, `META_APP_SECRET` e `CONTENT_SCHEDULER_ENABLED=true` e rode o deploy. (Isso é feito pela Vórtice.)' },
      { title: '7. Conecte as contas', text: 'Em **Redes Sociais > Contas**, clique em **Conectar com Facebook**, entre com um perfil que administra a Página e marque a Página e o Instagram vinculado.' },
      { title: 'Aprovação de posts', text: 'Em **Redes Sociais > Configurações**, o administrador pode exigir aprovação para vendedores. O post vai para "Aguardando aprovação" e admins e gerentes recebem um aviso. Ao reprovar, é obrigatório explicar o motivo.' },
      { title: 'Legenda com IA', text: 'No criador de post, clique em **Gerar com IA**, descreva o assunto e escolha o tom. Nada é aplicado sem você clicar em "Usar esta legenda".' },
    ],
  },

  // ── Custos e precificação ──────────────────────────────────
  {
    slug: 'custos-e-precificacao',
    category: 'financeiro',
    title: 'Custos e precificação',
    summary: 'Do custo do insumo ao preço de venda em cada canal, com lucro e ponto de equilíbrio.',
    sections: [
      { title: '1. Insumos', text: 'Cadastre cada insumo com o preço pago e a quantidade da embalagem (ex.: 1 kg de farinha por R$ 6,00). O sistema calcula o custo por unidade.' },
      { title: '2. Fichas técnicas', text: 'Monte cada produto com os insumos e as quantidades usadas. O custo do produto é calculado sozinho e muda quando o preço de um insumo muda.' },
      { title: '3. Despesas e canais', text: 'Informe as despesas fixas do mês, impostos, comissão, margem desejada e os canais de venda com a taxa de cada um (ex.: iFood, maquininha, loja). O preço sugerido aparece por canal.' },
      { title: '4. Vendas e resultado', text: 'Registre as vendas (ou importe planilha) para ver faturamento, lucro e o **ponto de equilíbrio**: quanto precisa vender no mês para pagar todas as despesas.' },
      { title: 'Importar planilha', text: 'A aba **Importar planilha** aceita insumos, produtos e vendas a partir de um arquivo, para não digitar tudo de novo.' },
    ],
  },

  // ── Senhas ─────────────────────────────────────────────────
  {
    slug: 'senhas-totem-tv',
    category: 'senhas',
    title: 'Senhas, totem e painel da TV',
    summary: 'Fila de atendimento presencial: retirada de senha no totem e chamada na TV.',
    sections: [
      { title: 'Links do totem e da TV', text: 'Em **Senhas**, use os botões **Totem** e **TV** para abrir (ou o ícone ao lado para copiar) os links da sua empresa. Abra cada um no aparelho correspondente, em tela cheia. Na TV, toque uma vez na tela para liberar o som: o navegador bloqueia áudio até alguém tocar.' },
      { title: 'Retirada de senha', text: 'No totem, a pessoa escolhe **Atendimento normal** ou **Preferencial** (idosos, gestantes, pessoas com deficiência ou com criança de colo) e informa nome, WhatsApp e documento (opcionais). Ela vê quantas pessoas estão na frente. Com WhatsApp, recebe a senha e o aviso quando for chamada (se houver WhatsApp conectado) e vira lead. A recepção também gera senhas em **Senha na recepção**.' },
      { title: 'Chamar e atender', text: 'Escolha o seu **guichê** (fica salvo neste computador) e clique em **Chamar a próxima**: as preferenciais vêm primeiro, depois a ordem de chegada. Dois guichês nunca chamam a mesma senha. Com a senha na tela: **Chamar de novo**, **Não veio**, **Finalizar** ou **Devolver à fila** (se chamou por engano). Na lista da fila dá para chamar uma senha fora de ordem ou cancelar.' },
      { title: 'Numeração e fim do dia', text: 'A numeração recomeça do 1 todo dia, sozinha. No fim do expediente, administradores e gerentes clicam em **Encerrar o dia**: quem ainda espera vira cancelada e o histórico continua salvo (tempo de espera, atendidas e quem não compareceu).' },
      { title: 'Configurações', text: 'Administradores e gerentes, em **Configurações**: logo, nome e cor do totem e da TV, recado do rodapé, quantidade de pontos de atendimento e como chamá-los (Guichê, Mesa, Sala...), senha preferencial no totem e voz na TV (lê a senha em voz alta).' },
      { title: 'Mídia na TV', text: 'Imagens e vídeos podem ser exibidos na TV entre as chamadas (Senhas > Configurações > Imagens e vídeos na TV).' },
    ],
  },

  // ── Chamados ───────────────────────────────────────────────
  {
    slug: 'chamados-suporte',
    category: 'conta',
    title: 'Chamados: falar com a Vórtice',
    summary: 'Abrir um chamado, acompanhar as respostas e confirmar quando resolveu.',
    sections: [
      { title: 'Abrir um chamado', text: 'Em **Chamados** (menu lateral) ou na **Central de Ajuda**, clique em **Abrir chamado**. Dê um título, escolha o assunto, diga o quanto isso atrapalha (de "Posso esperar" a "Sistema parado"), descreva o que aconteceu e, se puder, anexe um print (até 3 arquivos de 10 MB).' },
      { title: 'Acompanhar', text: 'Cada resposta da equipe e cada mudança de situação chega no **sino**. Marque **Avisar pelo WhatsApp** para receber também no celular. As situações são: **Aberto**, **Em andamento**, **Aguardando você** (a equipe precisa de uma resposta sua), **Resolvido** e **Encerrado**.' },
      { title: 'Confirmar que resolveu', text: 'Quando a equipe marcar como **Resolvido**, confirme em **Sim, resolveu** e avalie o atendimento. Se ainda não resolveu, é só responder: o chamado volta para a equipe.' },
      { title: 'Quem vê os chamados', text: 'Administradores e gerentes da sua empresa veem todos os chamados dela. Os demais usuários veem só os que abriram.' },
    ],
  },

  // ── Gestão ─────────────────────────────────────────────────
  {
    slug: 'metas-relatorios-projetos',
    category: 'gestao',
    title: 'Metas, relatórios, projetos e agenda',
    summary: 'Acompanhar resultados e organizar o trabalho da equipe.',
    sections: [
      { title: 'Relatórios', text: 'Em **Relatórios**, escolha o período (7, 30, 90 dias ou tudo) para ver novos leads, taxa de conversão, receita ganha e ticket médio.' },
      { title: 'Metas', text: 'Em **Metas**, crie objetivos com prazo e passos práticos. O painel separa metas cumpridas, em andamento, próximas e as que precisam de atenção.' },
      { title: 'Projetos', text: 'Em **Projetos**, acompanhe planos de ação por cliente, com metas semanais e foco comercial.' },
      { title: 'Planejamentos', text: 'Em **Planejamentos**, desenhe funis e mapas de estratégia em um quadro visual para testar ideias antes de colocar em prática.' },
      { title: 'Agendamento: agenda e tarefas', text: 'Em **Agendamento**, marque **compromissos** (com horário) e **tarefas** (com prazo). Cada item pode ter um lead e um responsável. Escolha um **lembrete** (na hora, 10 min, 30 min, 1 h ou 1 dia antes) e o aviso chega no sino de quem é o responsável. Em **Tarefas**, arraste os cartões entre Para fazer, Em andamento e Concluído; tarefas com prazo vencido ficam em vermelho.' },
      { title: 'Agendamento: envios agendados', text: 'Na aba **Envios agendados**, escolha o lead, o dia, o horário e a mensagem (pode usar uma resposta rápida). No horário, a mensagem sai pelo WhatsApp da empresa e aparece na conversa em Mensagens. Dá para alterar ou cancelar enquanto não saiu, e reagendar o que falhou. O envio e os lembretes dependem do agendador do servidor (CONTENT_SCHEDULER_ENABLED=true) e de um WhatsApp conectado em Integrações.' },
    ],
  },

  // ── Conta ──────────────────────────────────────────────────
  {
    slug: 'equipe-e-permissoes',
    category: 'conta',
    title: 'Equipe e permissões',
    summary: 'Cadastrar a equipe, definir cargos e o que cada pessoa vê e pode fazer.',
    sections: [
      { title: 'Cargos', text: '- **Administrador**: acesso a tudo, inclusive cadastrar a equipe, Integrações e dados da empresa.\n- **Gerente**: vê os leads de todos e edita automações e modelos de mensagem. Vê a equipe, mas não edita. Segue as permissões marcadas para ele.\n- **Vendedor**: trabalha nos próprios leads e vê só as páginas liberadas para ele.' },
      { title: 'Cadastrar', text: 'Em **Equipe > Novo membro**, informe nome, e-mail de login e uma senha inicial (o botão **Gerar** cria uma senha forte). Escolha o cargo: os acessos já vêm no padrão dele e dá para ajustar antes de salvar. Depois do cadastro, a senha aparece uma única vez com o botão **Copiar** para enviar à pessoa.' },
      { title: 'Acessos', text: 'Na aba **Acessos** de cada pessoa: **Páginas** é o que aparece no menu dela, **Recursos** são botões dentro das páginas (cadastrar contato, mensagens rápidas) e **Modelos de mensagem** define quais mensagens rápidas ela usa. Só aparecem os módulos do plano da empresa. **Padrão do cargo** volta tudo ao padrão.\n\nAs permissões valem também no servidor: sem a permissão, o sistema recusa o acesso mesmo por link direto ou por integrações. Administrador sempre pode tudo; gerente segue o que estiver marcado (o padrão do cargo libera tudo).' },
      { title: 'Trocar e-mail, senha ou desativar', text: '- Trocar o e-mail muda também o login: a pessoa passa a entrar com o e-mail novo.\n- **Trocar a senha** serve para quem esqueceu (a atual deixa de funcionar).\n- **Inativo** bloqueia o login e mantém o histórico. Dá para reativar quando quiser.' },
      { title: 'Remover', text: 'Remover apaga o acesso de vez. Antes, o sistema mostra quantos leads e metas a pessoa tem e pede para escolher quem fica com os leads. Se a ideia é só bloquear, prefira **Inativo**.' },
      { title: 'Atividades', text: 'Na aba **Atividades** dá para registrar algo que a pessoa fez (ex.: "fechou a venda com Padaria Central"). Aparece no Início dela e em "Atualizações recentes" para administradores e gerentes.' },
      { title: 'Pedido de nova senha', text: 'Quando alguém usa "Esqueceu a senha?", os administradores recebem um aviso no sino. Abra **Equipe**, selecione a pessoa e use **Trocar a senha**.' },
      { title: 'Proteções', text: 'Ninguém muda o próprio cargo nem desativa o próprio acesso, e o sistema não deixa remover ou desativar o último administrador ativo da empresa.' },
    ],
  },
  {
    slug: 'seguranca-e-conta',
    category: 'conta',
    title: 'Segurança e auditoria',
    summary: 'Como os dados da sua empresa ficam separados e como acompanhar o que foi feito.',
    sections: [
      { title: 'Dados separados por empresa', text: 'Cada empresa enxerga só os próprios leads, conversas, equipe, integrações e arquivos. Isso é garantido no banco de dados, não só na tela.' },
      { title: 'Auditoria', text: 'Logins, alterações de configuração, criação de leads e outras ações importantes ficam registradas com quem fez e quando. Administradores consultam o histórico.' },
      { title: 'Senhas e integrações', text: 'Senhas são guardadas pelo provedor de autenticação (nunca em texto puro). Tokens de integrações ficam só no servidor e aparecem mascarados na tela.' },
      { title: 'Empresa suspensa', text: 'Se o acesso da empresa for suspenso, ninguém dela consegue entrar até a Vórtice reativar.' },
    ],
  },
];

export const DEFAULT_FAQS: DefaultFaq[] = [
  { question: 'Como conectar o WhatsApp da empresa?', answer: 'Em Integrações, escolha WhatsApp Web (lendo um QR Code pelo celular) ou WhatsApp Business API (oficial da Meta). Os dois têm o passo a passo dentro da própria tela.' },
  { question: 'Esqueci minha senha. E agora?', answer: 'Na tela de login, clique em "Esqueceu a senha?" e informe seu e-mail. Os administradores da sua empresa recebem um aviso para definir uma nova senha para você.' },
  { question: 'Por que não vejo um módulo no menu?', answer: 'Os módulos dependem do plano da empresa e das permissões da sua função. Um administrador confere em Configurações > Plano e módulos e em Equipe.' },
  { question: 'As notificações não aparecem no computador.', answer: 'Em Configurações > Notificações, clique em Permitir e depois em Enviar teste. No Mac, libere o Chrome em Ajustes do Sistema > Notificações e desligue o modo Foco.' },
  { question: 'Como levo os leads do meu site para o sistema?', answer: 'Use Integrações > Captura de leads: gere a chave e cole o formulário pronto no seu site. Cada envio vira um lead na primeira etapa do funil.' },
  { question: 'Consigo mandar os leads para uma planilha?', answer: 'Sim. Em Integrações > Google Sheets há um código pronto para colar no Apps Script da sua planilha; cada lead novo vira uma linha.' },
];
