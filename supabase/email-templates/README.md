# Templates de e-mail do Sincerão

Modelos HTML prontos para colar no painel do Supabase em `Authentication > Emails`.
Mesmo padrão estrutural usado nos templates do VectonPlan (tabela pra compatibilidade
com clientes de e-mail, botão em pílula, caixa de destaque, link alternativo), com as
cores e o logo do Sincerão (fundo `#3d0030`, card branco, botão `#5a0048`).

## Arquivos

- `invite-user.html`: convite enviado pelo fluxo `admin.inviteUserByEmail` — é o que
  o RH dispara ao cadastrar um colaborador (e também ao "Reenviar convite").
- `reset-password.html`: redefinição de senha — usado tanto no "Esqueci minha senha"
  do login quanto no "Redefinir senha" que o RH aciona pra um colaborador.
- `confirm-signup.html`: confirmação de cadastro. O Sincerão não tem fluxo de
  autocadastro hoje (todo acesso é por convite do RH), então esse template
  provavelmente nunca dispara — incluído só por completude/caso isso mude no futuro.

## Assuntos sugeridos

- `Confirm sign up`: `Confirme seu e-mail no Sincerão`
- `Invite user`: `Seu acesso ao Sincerão foi liberado`
- `Reset password`: `Redefina sua senha do Sincerão`

## Observações

- Os templates usam `{{ .ConfirmationURL }}`, a variável padrão do Supabase — não mexer.
- O logo é carregado de `https://sincerao.marcher.com.br/assets/logo.png` (precisa do
  deploy do GitHub Pages já publicado pra imagem aparecer nos e-mails).
- O front-end já trata os tipos `invite` e `recovery` em `js/auth/auth-module.js`
  (variável `AUTH_URL_TYPE`, tela "Definir senha").
