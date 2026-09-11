# Templates de e-mail do Sincerão

⚠️ **Estes arquivos NÃO são mais o que realmente envia convite/redefinição de senha**
(2026-09-11, fix do bug de loop na recuperação — ver `supabase/functions/forgot-password/
index.ts` e a nota grande no topo dele). Convite e redefinição de senha hoje passam pelas
Edge Functions `invite-colaborador`, `admin-colaborador` (`reenviar_convite`) e
`forgot-password`, que montam o HTML do e-mail internamente (visual idêntico ao
`invite-user.html`/`reset-password.html` daqui, mas com o link já resolvido pra
`token_hash`) e mandam via Resend — **não** pelo painel `Authentication > Emails` do
Supabase. Motivo: o `{{ .ConfirmationURL }}` do Supabase é um link de uso único que o
Microsoft Defender Safe Links (tenant @marcher.com.br) consome sozinho antes do usuário
clicar, causando o loop de volta pro login. Mesmo bug/fix do VectonPlan (2026-08-27).

Os arquivos abaixo ficam só como referência visual — se o layout do e-mail mudar,
replicar também nas functions acima.

## Arquivos

- `invite-user.html`: layout de referência do convite (o envio real está em
  `invite-colaborador`/`admin-colaborador`).
- `reset-password.html`: layout de referência da redefinição de senha (o envio real
  está em `forgot-password`).
- `confirm-signup.html`: confirmação de cadastro. O Sincerão não tem fluxo de
  autocadastro hoje (todo acesso é por convite do RH), então esse template
  provavelmente nunca dispara — incluído só por completude/caso isso mude no futuro.
  Este é o único que ainda pode ser colado de verdade no painel do Supabase, já que
  não sofre do problema de link de uso único acima (não tem fluxo real disparando ele).

## Assuntos sugeridos

- `Confirm sign up`: `Confirme seu e-mail no Sincerão`
- `Invite user`: `Seu acesso ao Sincerão foi liberado` (referência — envio real via Resend)
- `Reset password`: `Redefina sua senha do Sincerão` (referência — envio real via Resend)

## Observações

- O front-end trata os tipos `invite` e `recovery` em `js/auth/auth-module.js`, via
  `token_hash`+`type` na query string do link (`mostrarGateDefinirSenha`) — não mais
  pelo hash `#access_token=...` do `{{ .ConfirmationURL }}`.
- O logo é carregado de `https://sincerao.marcher.com.br/assets/logo.png` (precisa do
  deploy do GitHub Pages já publicado pra imagem aparecer nos e-mails).
