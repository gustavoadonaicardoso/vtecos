import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { callAI } from '@/lib/ai';
import { INSTAGRAM_CAPTION_LIMIT, INSTAGRAM_HASHTAG_LIMIT } from '@/lib/social/rules';

const TONES: Record<string, string> = {
  profissional: 'profissional e confiável',
  descontraido: 'descontraído e próximo, com leveza',
  inspirador: 'inspirador e motivacional',
  vendedor: 'persuasivo e focado em conversão, com chamada para ação clara',
  educativo: 'educativo e didático, entregando valor',
};

const MAX_BRIEF_LENGTH = 1500;

function sanitizeHashtag(raw: unknown) {
  if (typeof raw !== 'string') return null;
  const tag = raw.trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
  return tag ? `#${tag}` : null;
}

export async function POST(request: Request) {
  const auth = await requireActiveProfile({ module: 'social', permission: 'social.view' });
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const body = await request.json().catch(() => ({}));
  const brief = typeof body?.brief === 'string' ? body.brief.trim() : '';
  const currentCaption = typeof body?.currentCaption === 'string' ? body.currentCaption.trim().slice(0, 3000) : '';
  const tone = TONES[body?.tone] ? body.tone : 'profissional';
  const platforms: string[] = Array.isArray(body?.platforms)
    ? body.platforms.filter((p: unknown) => p === 'instagram' || p === 'facebook')
    : [];

  if (!brief && !currentCaption) {
    return NextResponse.json({ error: 'Descreva sobre o que é o post (ou escreva um rascunho da legenda).' }, { status: 400 });
  }
  if (brief.length > MAX_BRIEF_LENGTH) {
    return NextResponse.json({ error: `O briefing pode ter no máximo ${MAX_BRIEF_LENGTH} caracteres.` }, { status: 400 });
  }

  const networks = platforms.length > 0 ? platforms.map((p) => (p === 'instagram' ? 'Instagram' : 'Facebook')).join(' e ') : 'Instagram e Facebook';

  const prompt = `Você é social media de uma empresa brasileira. Escreva a legenda de um post para ${networks}.

Regras:
- Português do Brasil, tom ${TONES[tone]}.
- Comece com uma primeira linha que prenda a atenção.
- Parágrafos curtos, com no máximo 3 emojis no texto todo.
- Termine com uma chamada para ação.
- NÃO coloque hashtags dentro da legenda; elas vão separadas.
- Legenda com no máximo 1500 caracteres.
- De 5 a 12 hashtags relevantes em português, sem espaços.
- Não invente preços, datas, endereços, telefones ou promoções que não estejam no briefing.

${brief ? `Briefing: """${brief}"""` : ''}
${currentCaption ? `Rascunho atual para melhorar: """${currentCaption}"""` : ''}

Responda só com JSON no formato {"caption": "texto da legenda", "hashtags": ["#exemplo"]}.`;

  const result = await callAI(prompt, { temperature: 0.8, maxOutputTokens: 2048 });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  let parsed: { caption?: unknown; hashtags?: unknown };
  try {
    parsed = JSON.parse(result.text);
  } catch {
    return NextResponse.json({ error: 'A IA respondeu num formato inesperado. Tente de novo.' }, { status: 502 });
  }

  const caption = typeof parsed.caption === 'string' ? parsed.caption.trim() : '';
  if (!caption) {
    return NextResponse.json({ error: 'A IA não gerou uma legenda. Tente detalhar mais o briefing.' }, { status: 502 });
  }

  const hashtags = [...new Set((Array.isArray(parsed.hashtags) ? parsed.hashtags : []).map(sanitizeHashtag).filter(Boolean))]
    .slice(0, Math.min(15, INSTAGRAM_HASHTAG_LIMIT)) as string[];

  return NextResponse.json({
    success: true,
    data: { caption: caption.slice(0, INSTAGRAM_CAPTION_LIMIT - 300), hashtags },
  });
}
