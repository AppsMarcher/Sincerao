-- Permite que cada pessoa remova apenas as próprias notificações.
create policy notificacoes_delete on notificacoes
for delete using (destinatario_id = auth.uid());
