'use client';

import { useState, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './totem.module.css';
import { logAudit } from '@/lib/audit';
import { sendWhatsApp } from '@/lib/zapi';

export default function TotemPage() {
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [document, setDocument] = useState('');
  const [issuedTicket, setIssuedTicket] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    
    // Basic validation
    if (!name.trim()) {
      alert('Por favor, informe seu nome completo.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Get highest current number
      const { data, error: fetchError } = await (supabase?.from('queue_tickets').select('number').order('number', { ascending: false }).limit(1) || { data: null });
      
      const lastNumber = data?.[0]?.number || 0;
      const nextNumber = lastNumber + 1;

      // 2. Insert new ticket
      const ticketData = { 
        number: nextNumber, 
        name: name.trim(), 
        status: 'waiting',
        whatsapp: whatsapp.trim(),
        document: document.trim()
      };

      let { error: insertError } = await (supabase?.from('queue_tickets').insert([ticketData]) || { error: { message: 'Supabase não inicializado' } });

      // If it fails, try a fallback without the new columns (whatsapp/document)
      if (insertError && (insertError as any).code === 'PGRST204') {
        console.warn('Colunas whatsapp/document ausentes, tentando fallback...');
        const fallbackData = { number: nextNumber, name: name.trim(), status: 'waiting' };
        const { error: fallbackError } = await (supabase?.from('queue_tickets').insert([fallbackData]) || { error: { message: 'Supabase não inicializado' } });
        insertError = fallbackError;
      }

      if (!insertError) {
        setIssuedTicket(nextNumber);

        // Zap Automation
        if (whatsapp && whatsapp.trim()) {
          sendWhatsApp(whatsapp.trim(), `🌟 *Estação Vórtice* 🌟\n\nSua senha foi retirada com sucesso!\n\nTicket: *#${nextNumber.toString().padStart(2, '0')}*\nCliente: *${name.trim()}*\n\nPor favor, acompanhe o telão. Você será chamado em breve!`);
        }

        // Audit Log
        logAudit(
          null,
          'TICKET_CREATE',
          `Nova senha #${nextNumber} gerada via Totem para ${name.trim()}.`,
          'ticket',
          nextNumber.toString()
        );

        // 3. Automatically create a Lead (optional/fail-safe)
        try {
          const { data: stageData } = await (supabase?.from('pipeline_stages').select('id').order('position').limit(1) || { data: null });
          const stageId = stageData?.[0]?.id || 'novo';

          await supabase?.from('leads').insert([{
            name: name.trim(),
            phone: whatsapp.trim(),
            cpf_cnpj: document.trim(),
            source: 'Totem',
            stage_id: stageId,
            tags: ['Totem', 'Presencial']
          }]);
        } catch (leadErr) {
          console.error('Lead sync error:', leadErr);
        }
      } else {
        console.error('Full Insert Error:', insertError);
        alert(`Erro ao gerar senha: ${insertError?.message || 'Erro desconhecido'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setIssuedTicket(null);
    setName('');
    setWhatsapp('');
    setDocument('');
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>VÓRTICE TOTEM</div>
        
        {issuedTicket === null ? (
          <>
            <h1 className={styles.title}>Retirar Senha</h1>
            <p className={styles.subtitle}>Preencha os dados abaixo para entrar na fila</p>
            
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>NOME COMPLETO</label>
                <input 
                  type="text" 
                  className={styles.input} 
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  required
                  autoFocus
                />
              </div>

              <div className={styles.gridFields}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>WHATSAPP</label>
                  <input 
                    type="tel" 
                    className={styles.input} 
                    value={whatsapp} 
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.label}>DOCUMENTO (CPF/RG)</label>
                  <input 
                    type="text" 
                    className={styles.input} 
                    value={document} 
                    onChange={(e) => setDocument(e.target.value)}
                    placeholder="Seu documento"
                  />
                </div>
              </div>
              
              <button 
                type="submit" 
                className={styles.submitBtn}
                disabled={isLoading}
              >
                {isLoading ? 'GERANDO...' : 'RETIRAR MINHA SENHA'}
              </button>
            </form>
          </>
        ) : (
          <div className={styles.successDisplay}>
            <h1 className={styles.title}>Sua Senha</h1>
            <div className={styles.ticketResult}>
              #{issuedTicket.toString().padStart(2, '0')}
            </div>
            <p className={styles.subtitle} style={{ color: '#10b981', fontWeight: 'bold' }}>
              AGUARDE SER CHAMADO NO PAINEL
            </p>
            
            <button className={styles.resetBtn} onClick={handleReset}>
              CONCLUÍDO / VOLTAR AO INÍCIO
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

