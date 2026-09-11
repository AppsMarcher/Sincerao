// Supabase Edge Function: forgot-password
//
// Self-service "Esqueci minha senha" da tela de login E o botão "Redefinir
// senha" do RH em admin-colaborador (js/admin/colaboradores-module.js) --
// os dois casos são o mesmo fluxo, só muda quem aperta o botão.
//
// Por que não usar o endpoint público GoTrue /auth/v1/recover
// (resetPasswordForEmail) direto do cliente, como era antes: aquele fluxo
// manda o e-mail com o action_link bruto do Supabase
// (/auth/v1/verify?token=...&type=recovery&redirect_to=...), que é um GET de
// USO ÚNICO. O tenant @marcher.com.br tem o Microsoft Defender for Office
// 365 (Safe Links) ativo, que varre esse link em tempo de entrega do e-mail
// -- antes de qualquer humano abrir a mensagem -- e isso já CONSOME o
// token. O clique real do usuário sempre caía em "Email link is invalid or
// has expired" e voltava pro app sem sessão, ou seja, direto pra tela de
// login -- o "loop" reportado. Mesmo bug, mesmo diagnóstico e mesmo fix já
// aplicados no VectonPlan em 2026-08-27 (mesmo tenant).
//
// Fix (idêntico ao invite-colaborador/admin-colaborador, que já não usavam
// mais action_link pro convite): `generateLink` cria o link mas NÃO manda
// e-mail; pegamos o `hashed_token` (não o `action_link`) e montamos um link
// pro PRÓPRIO domínio do app com `?token_hash=...&type=recovery` -- um link
// "normal" sem nenhum efeito colateral em ser só pré-carregado por um
// scanner. A troca de verdade (`verifyOtp`) só acontece no clique real de um
// botão dentro do app (ver js/auth/auth-module.js, mostrarGateDefinirSenha),
// nunca automaticamente no load da página -- scanners de link não executam
// JS. O envio em si vai por Resend, não pelo SMTP do painel/Office365 (mesmo
// motivo do invite: pra destinatários @marcher.com.br o Outlook sobrescreve
// o nome do remetente pelo GAL/Diretório do Exchange).
//
// Proteção contra oráculo de enumeração de e-mail:
// 1. SEMPRE responde {ok:true} genérico, exista o e-mail ou não, e mesmo em
//    cooldown -- nunca revela se o e-mail está cadastrado.
// 2. Cooldown de 5 min por e-mail via tabela password_reset_requests
//    (migration 039) -- ignora silenciosamente pedidos repetidos dentro da
//    janela em vez de gerar/mandar um novo link a cada clique.
//
// Deploy (colar no painel do Supabase, igual invite-colaborador/
// admin-colaborador -- não tem CLI/config.toml configurado neste projeto):
//   supabase functions deploy forgot-password --no-verify-jwt
//   (--no-verify-jwt porque é chamado por usuário anônimo, sem sessão, na
//   tela de login)
//
// Pré-requisitos: secrets RESEND_API_KEY e RESEND_FROM (já existem, usados
// por invite-colaborador/admin-colaborador).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos entre pedidos pro mesmo e-mail

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Usada em TODO caminho de saída "normal" (e-mail inexistente, em cooldown,
// ou enviado com sucesso) -- nunca deixar o front diferenciar esses casos.
function genericOk() {
  return json({ ok: true });
}

// Constrói o link do e-mail apontando pro PRÓPRIO app (não mais o
// action_link bruto do GoTrue) -- ver nota no topo do arquivo sobre o
// Defender Safe Links.
function buildConfirmLink(redirectTo: string, type: string, hashedToken: string): string {
  const sep = redirectTo.includes('?') ? '&' : '?';
  return `${redirectTo}${sep}token_hash=${encodeURIComponent(hashedToken)}&type=${type}`;
}

// Mesmo visual de supabase/email-templates/reset-password.html, só que com
// {{ .ConfirmationURL }} já resolvido pro link de verdade -- o Resend não
// processa a sintaxe de template do Supabase, o link precisa ir pronto. Se o
// layout mudar lá, replicar aqui também.
function resetPasswordEmailHtml(confirmLink: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redefina sua senha</title>
</head>
<body style="margin:0;padding:0;background-color:#3d0030;font-family:'Segoe UI',Arial,sans-serif;color:#1e1e1e;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#3d0030;margin:0;padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;">
          <tr>
            <td style="padding:0 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:24px;overflow:hidden;">
                <tr>
                  <td style="padding:36px 32px 32px 32px;">
                    <img src="https://sincerao.marcher.com.br/assets/logo.png" alt="Sincerão" width="176" height="44" style="display:block;height:44px;width:176px;margin:0 auto 24px auto;">
                    <h1 style="margin:0 0 12px 0;font-size:28px;line-height:1.2;color:#1e1e1e;font-weight:700;">
                      Redefina sua senha
                    </h1>
                    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#666070;">
                      Recebemos uma solicitação para redefinir a senha da sua conta no Sincerão. Use o botão abaixo para criar uma nova senha com segurança.
                    </p>
                    <table role="presentation" align="center" cellspacing="0" cellpadding="0" style="margin:24px auto 24px auto;">
                      <tr>
                        <td align="center" bgcolor="#5a0048" style="border-radius:100px;">
                          <a href="${confirmLink}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;line-height:1;text-decoration:none;color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;">
                            Criar nova senha
                          </a>
                        </td>
                      </tr>
                    </table>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;background:#f1eef3;border-radius:16px;">
                      <tr>
                        <td style="padding:16px 18px;">
                          <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#666070;font-weight:700;">
                            Atenção
                          </p>
                          <p style="margin:0;font-size:13.5px;line-height:1.7;color:#1e1e1e;">
                            Se você não pediu essa redefinição, pode ignorar este e-mail — sua senha atual continua valendo normalmente.
                          </p>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0 0 12px 0;font-size:13px;line-height:1.7;color:#9a95a0;">
                      Se o botão não funcionar, copie e cole este link no navegador:
                    </p>
                    <p style="margin:0;padding:12px 14px;border-radius:12px;background:#f1eef3;font-size:12.5px;line-height:1.6;color:#5a0048;word-break:break-all;">
                      ${confirmLink}
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0 0;padding:0 8px;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.75);text-align:center;">
                Sincerão — feedback conectado ao desenvolvimento. Marcher Brasil Agroindustrial.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function enviarEmailRedefinicao(email: string, confirmLink: string) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) throw new Error('Secret RESEND_API_KEY ausente.');
  const from = Deno.env.get('RESEND_FROM') || 'Sincerão Marcher <no-reply@marcher.com.br>';

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Redefina sua senha do Sincerão',
      html: resetPasswordEmailHtml(confirmLink),
    }),
  });
  const resendData = await resendRes.json().catch(() => ({}));
  if (!resendRes.ok) throw new Error(resendData?.message || `Falha ao enviar e-mail (Resend ${resendRes.status}).`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    const redirectTo = body.redirect_to ? String(body.redirect_to).trim() : '';
    if (!email || !email.includes('@')) return json({ error: 'E-mail inválido.' }, 400);
    if (!redirectTo) return json({ error: 'redirect_to é obrigatório.' }, 400);

    // Cooldown: se já pediu há menos de 5 min, não gera novo link nem manda
    // e-mail de novo -- mas responde ok igual, pra não vazar informação.
    const { data: lastRequest } = await admin
      .from('password_reset_requests')
      .select('requested_at')
      .eq('email', email)
      .maybeSingle();
    if (lastRequest && Date.now() - new Date(lastRequest.requested_at).getTime() < COOLDOWN_MS) {
      return genericOk();
    }
    await admin.from('password_reset_requests').upsert({ email, requested_at: new Date().toISOString() });

    // Só gera/manda o link se o e-mail pertencer a um colaborador de verdade.
    const { data: perfil } = await admin.from('perfis').select('email').ilike('email', email).maybeSingle();
    if (!perfil) return genericOk();

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: perfil.email,
      options: { redirectTo },
    });
    if (linkError) {
      console.error('generateLink falhou:', linkError.message);
      return genericOk();
    }
    const hashedToken = linkData?.properties?.hashed_token;
    if (!hashedToken) return genericOk();
    const confirmLink = buildConfirmLink(redirectTo, 'recovery', hashedToken);

    try {
      await enviarEmailRedefinicao(perfil.email, confirmLink);
    } catch (e) {
      console.error('Resend falhou:', String((e as Error)?.message ?? e));
    }

    return genericOk();
  } catch (e) {
    console.error(e);
    // Mesmo em erro inesperado, não vazar detalhe pro front.
    return genericOk();
  }
});
