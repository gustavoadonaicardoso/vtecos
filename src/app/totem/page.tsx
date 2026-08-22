'use client';

import { useState, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './totem.module.css';
import { logAudit } from '@/lib/audit';
import { sendWhatsApp } from '@/lib/zapi';
import {
  formatBrazilDocument,
  formatBrazilPhone,
  normalizeBrazilPhone,
  parseBrazilDocumentInput,
  parseBrazilPhoneInput,
  validateBrazilDocument,
  validateBrazilPhone,
} from '@/lib/brazilian-fields';

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

    const phoneError = validateBrazilPhone(whatsapp);
    const documentError = validateBrazilDocument(document);
    if (phoneError || documentError) {
      alert(phoneError || documentError);
      return;
    }

    const normalizedWhatsapp = normalizeBrazilPhone(whatsapp);
    const normalizedDocument = parseBrazilDocumentInput(document);

    setIsLoading(true);

    try {
      const response = await fetch('/api/queue/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, whatsapp: normalizedWhatsapp, document: normalizedDocument }),
      });
      const result: { number?: number; error?: string } = await response.json();

      if (!response.ok || typeof result.number !== 'number') {
        throw new Error(result.error || 'Não foi possível gerar a senha.');
      }

      const nextNumber = result.number;
        setIssuedTicket(nextNumber);

        // Zap Automation
        if (normalizedWhatsapp) {
          sendWhatsApp(normalizedWhatsapp, `🌟 *Estação Vórtice* 🌟\n\nSua senha foi retirada com sucesso!\n\nTicket: *#${nextNumber.toString().padStart(2, '0')}*\nCliente: *${name.trim()}*\n\nPor favor, acompanhe o telão. Você será chamado em breve!`);
        }

        // Audit Log
        logAudit(
          null,
          'TICKET_CREATE',
          `Nova senha #${nextNumber} gerada via Totem para ${name.trim()}.`,
          'ticket',
          nextNumber.toString()
        );

        // Automatically create a Lead (optional/fail-safe)
        try {
          const { data: stageData } = await (supabase?.from('pipeline_stages').select('id').order('position').limit(1) || { data: null });
          const stageId = stageData?.[0]?.id || 'novo';

          await supabase?.from('leads').insert([{
            name: name.trim(),
            phone: normalizedWhatsapp,
            cpf_cnpj: normalizedDocument,
            source: 'Totem',
            stage_id: stageId,
            tags: ['Totem', 'Presencial']
          }]);
        } catch (leadErr) {
          console.error('Lead sync error:', leadErr);
        }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro de conexão.';
      console.error('Erro ao gerar senha:', message);
      alert(`Erro ao gerar senha: ${message}`);
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
                <label className={styles.label} htmlFor="totem-name">NOME COMPLETO</label>
                <input
                  id="totem-name"
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
                  <label className={styles.label} htmlFor="totem-whatsapp">WHATSAPP</label>
                  <input
                    id="totem-whatsapp"
                    type="tel"
                    className={styles.input} 
                    value={formatBrazilPhone(whatsapp)}
                    onChange={(e) => setWhatsapp(parseBrazilPhoneInput(e.target.value))}
                    placeholder="+55 (00) 90000-0000"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={19}
                  />
                  <small className={styles.fieldHint}>DDD + número; o prefixo +55 é automático.</small>
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.label} htmlFor="totem-document">DOCUMENTO (CPF/RG)</label>
                  <input
                    id="totem-document"
                    type="text" 
                    className={styles.input} 
                    value={formatBrazilDocument(document)}
                    onChange={(e) => setDocument(parseBrazilDocumentInput(e.target.value))}
                    placeholder="CPF ou RG"
                    autoComplete="off"
                    maxLength={14}
                  />
                  <small className={styles.fieldHint}>CPF: 11 dígitos; RG: 7 a 9 caracteres.</small>
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
            <p className={`${styles.subtitle} ${styles.successMessage}`}>
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

