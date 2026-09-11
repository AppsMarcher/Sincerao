import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Domínio de produção -- usado pra montar o link de confirmação (ver
// buildConfirmLink abaixo). Mesmo domínio já hardcoded no <img> do e-mail.
const SITE_URL = 'https://sincerao.marcher.com.br/';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Constrói o link do e-mail apontando pro PRÓPRIO app com token_hash na
// query -- NÃO o action_link bruto do GoTrue. Ver nota completa em
// invite-colaborador/index.ts (mesmo motivo: Microsoft Defender Safe Links
// no tenant @marcher.com.br consome o link de uso único antes do clique
// real do usuário, causando o loop de volta pro login).
function buildConfirmLink(type: string, hashedToken: string): string {
  return `${SITE_URL}?token_hash=${encodeURIComponent(hashedToken)}&type=${type}`;
}

// Mesmo template/lógica de envio do invite-colaborador (duplicado de propósito:
// as duas functions são coladas manualmente no painel do Supabase, uma por vez,
// então importar um módulo compartilhado não é confiável nesse fluxo de deploy).
function inviteEmailHtml(actionLink: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seu acesso ao Sincerão</title>
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
                      Você foi convidado pro Sincerão
                    </h1>
                    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#666070;">
                      O RH da Marcher Brasil criou seu acesso ao Sincerão, a ferramenta de avaliação de desempenho e feedback da empresa. Clique no botão abaixo para definir sua senha e confirmar seu cadastro.
                    </p>
                    <table role="presentation" align="center" cellspacing="0" cellpadding="0" style="margin:24px auto 24px auto;">
                      <tr>
                        <td align="center" bgcolor="#5a0048" style="border-radius:100px;">
                          <a href="${actionLink}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;line-height:1;text-decoration:none;color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;">
                            Definir senha e entrar
                          </a>
                        </td>
                      </tr>
                    </table>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;background:#f1eef3;border-radius:16px;">
                      <tr>
                        <td style="padding:16px 18px;">
                          <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#666070;font-weight:700;">
                            Importante
                          </p>
                          <p style="margin:0 0 10px 0;font-size:13.5px;line-height:1.7;color:#1e1e1e;">
                            Esse link é pessoal e leva direto pra tela de criação de senha. Depois de definida, seu acesso já fica liberado — não precisa fazer mais nada.
                          </p>
                          <p style="margin:0;font-size:13.5px;line-height:1.7;color:#1e1e1e;">
                            O Sincerão Marcher recomenda a utilização do navegador <a href="https://www.google.com/chrome/" style="color:#5a0048;font-weight:700;text-decoration:underline;">Google Chrome</a> para uma melhor experiência no app.
                          </p>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0 0 12px 0;font-size:13px;line-height:1.7;color:#9a95a0;">
                      Se o botão não funcionar, copie e cole este link no navegador:
                    </p>
                    <p style="margin:0;padding:12px 14px;border-radius:12px;background:#f1eef3;font-size:12.5px;line-height:1.6;color:#5a0048;word-break:break-all;">
                      ${actionLink}
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0 0;padding:0 8px;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.75);text-align:center;">
                Se você recebeu este e-mail por engano, pode ignorá-lo com segurança.<br>
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

async function enviarEmailConvite(email: string, actionLink: string) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) throw new Error('Envio de e-mail não configurado nesta function (secret RESEND_API_KEY ausente).');
  const from = Deno.env.get('RESEND_FROM') || 'Sincerão Marcher <no-reply@marcher.com.br>';

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Seu acesso ao Sincerão foi liberado',
      html: inviteEmailHtml(actionLink),
    }),
  });
  const resendData = await resendRes.json().catch(() => ({}));
  if (!resendRes.ok) throw new Error(resendData?.message || `Falha ao enviar e-mail (Resend ${resendRes.status}).`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: 'Não autenticado.' }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: solicitante } = await adminClient
      .from('perfis')
      .select('papel')
      .eq('id', userData.user.id)
      .single();

    if (!solicitante || !['rh', 'admin'].includes(solicitante.papel)) {
      return json({ error: 'Acesso restrito ao RH.' }, 403);
    }

    // Corpo lido uma única vez — cada ação usa só os campos que precisa.
    const { acao, colaborador_id, senha, novo_email } = await req.json();
    if (!acao || !colaborador_id) return json({ error: 'Ação e colaborador_id são obrigatórios.' }, 400);

    const { data: colaborador } = await adminClient
      .from('perfis')
      .select('id, nome, email')
      .eq('id', colaborador_id)
      .single();
    if (!colaborador) return json({ error: 'Colaborador não encontrado.' }, 404);

    if (acao === 'reenviar_convite') {
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email: colaborador.email,
        options: { data: { nome: colaborador.nome }, redirectTo: SITE_URL },
      });
      if (linkError) {
        const jaConfirmado = /already registered|already been registered/i.test(linkError.message);
        return json(
          { error: jaConfirmado ? 'Esse colaborador já confirmou o cadastro — use "Redefinir senha" em vez de reenviar convite.' : linkError.message },
          400
        );
      }
      const hashedToken = linkData?.properties?.hashed_token;
      if (!hashedToken) return json({ error: 'Falha ao gerar link de convite.' }, 500);
      const actionLink = buildConfirmLink('invite', hashedToken);
      try {
        await enviarEmailConvite(colaborador.email, actionLink);
      } catch (e) {
        return json({ error: String((e as Error)?.message ?? e) }, 502);
      }
      return json({ ok: true });
    }

    if (acao === 'definir_senha') {
      if (!senha || String(senha).length < 6) return json({ error: 'A senha precisa ter ao menos 6 caracteres.' }, 400);
      const { error } = await adminClient.auth.admin.updateUserById(colaborador_id, { password: senha });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (acao === 'atualizar_email') {
      if (!novo_email) return json({ error: 'Informe o novo e-mail.' }, 400);
      const { error: authError } = await adminClient.auth.admin.updateUserById(colaborador_id, { email: novo_email });
      if (authError) return json({ error: authError.message }, 400);
      const { error: perfilError } = await adminClient.from('perfis').update({ email: novo_email }).eq('id', colaborador_id);
      if (perfilError) return json({ error: perfilError.message }, 400);
      return json({ ok: true });
    }

    if (acao === 'excluir') {
      if (colaborador_id === userData.user.id) return json({ error: 'Você não pode excluir a própria conta.' }, 400);
      const { error } = await adminClient.auth.admin.deleteUser(colaborador_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
