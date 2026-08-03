# Notificar gestores

Edge Function usada pelo botão **Notificar gestores** e pela execução automática diária.

## Secrets

Configure no projeto Supabase:

```text
RESEND_API_KEY
RESEND_FROM
CRON_SECRET
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são disponibilizadas automaticamente às Edge Functions.

## Agendamento

Crie um agendamento diário para `POST /functions/v1/notificar-gestores`, preferencialmente às 09:00 no horário de São Paulo (12:00 UTC). O corpo deve ser:

```json
{"modo":"automatico"}
```

Headers obrigatórios:

```text
apikey: <SUPABASE_PUBLISHABLE_KEY>
Content-Type: application/json
x-cron-secret: <mesmo valor de CRON_SECRET>
```

A função envia nos marcos de 7, 3 e 1 dia, no último dia, no primeiro dia de atraso e depois a cada três dias, por até 30 dias após o encerramento. A tabela `notificacao_disparos` impede a repetição do mesmo marco.

Não use `--no-verify-jwt`: o gateway valida a chave publicável do agendador e a função valida adicionalmente `x-cron-secret`.
