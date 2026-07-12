# Programa de Privacidade e Segurança — Conduzir Talentos

Documento interno preliminar. Versão técnica: 12/07/2026.

## Dados que precisam ser preenchidos antes do lançamento

- Razão social:
- Nome fantasia:
- CNPJ:
- Endereço:
- Representante legal:
- Canal oficial de privacidade:
- Responsável/encarregado por privacidade:
- Telefone/WhatsApp oficial:
- Prazo de resposta interno para solicitações:

## Inventário resumido de tratamento

| Processo | Dados | Titular | Finalidade | Base legal a validar | Compartilhamento |
|---|---|---|---|---|---|
| Cadastro de candidato | nome, e-mail, telefone, região | candidato | conta e perfil | contrato/procedimentos preliminares | Firebase |
| Perfil profissional | currículo, formação, experiência, competências | candidato | recrutamento e serviços | contrato e/ou consentimento para divulgação | empresas autorizadas |
| DISC e avaliações | respostas, percentuais, pareceres | candidato | orientação e avaliação | consentimento específico ou outra hipótese validada | equipe; empresa somente se juridicamente definido |
| Cadastro empresarial | contato, login, CPF/CNPJ de cobrança | representante/empresa | contrato e cobrança | contrato/obrigação legal | Firebase e Asaas |
| Pagamentos | identificadores, valor e status | empresa/candidato | cobrança e conciliação | contrato/obrigação legal | Asaas |
| Entrevistas e mensagens | agenda, observações, comunicações | candidato/empresa | execução do serviço | contrato | equipe e partes relacionadas |
| Segurança | UID, horários, eventos e logs | usuários | prevenção a fraude e segurança | legítimo interesse/obrigação | Firebase/Google Cloud |

## Retenção sugerida para decisão jurídica

- Conta ativa: durante a relação contratual.
- Perfil de candidato sem atividade: revisar prazo entre 12 e 24 meses e solicitar renovação.
- Currículo substituído: excluir a versão anterior após confirmação da nova versão, salvo necessidade documentada.
- DISC e avaliações: definir prazo reduzido e revisão periódica por causa do maior risco.
- Solicitações LGPD: manter protocolo e evidência de atendimento pelo prazo jurídico definido.
- Dados fiscais e financeiros: conservar pelo prazo legal aplicável, com acesso restrito.
- Logs de segurança: prazo proporcional ao risco, sugerido tecnicamente entre 6 e 12 meses.
- Contas excluídas: eliminar ou anonimizar o que não tiver obrigação legal de conservação.

## Procedimento de solicitação do titular

1. Receber protocolo na coleção `privacy_requests`.
2. Confirmar identidade sem solicitar senha.
3. Classificar pedido e localizar os sistemas envolvidos.
4. Verificar obrigação legal de conservação e direitos de terceiros.
5. Executar acesso, correção, bloqueio, revogação, revisão ou eliminação cabível.
6. Registrar responsável, decisão, data e justificativa.
7. Responder ao titular pelo canal cadastrado.

## Procedimento mínimo de incidente

1. Conter o acesso e preservar evidências.
2. Revogar sessões, tokens ou credenciais afetadas.
3. Identificar dados, titulares, período e impacto.
4. Registrar decisões e medidas de correção.
5. Avaliar, com responsável jurídico, risco ou dano relevante e necessidade de comunicação à ANPD e aos titulares.
6. Corrigir a causa, testar e acompanhar recorrência.
7. Nunca ocultar ou apagar evidências do incidente.

## Controles técnicos implementados

- Firebase Authentication e HTTPS.
- Segredos do Asaas no Secret Manager.
- Verificação de token no checkout e token exclusivo no webhook.
- Preço validado no servidor e proteção de idempotência.
- Firestore separado por proprietário, empresa e equipe.
- Projeção pública de candidato separada do cadastro interno.
- Currículos novos em Firebase Storage privado.
- Aceites versionados de Termos, Privacidade, divulgação e DISC.
- Canal autenticado para solicitações LGPD.
- Cabeçalhos de segurança no Hosting.
- Tokens removidos dos logs.

## Pendências organizacionais

- Contratar validação jurídica dos documentos e bases legais.
- Formalizar contratos com consultoras e dever de confidencialidade.
- Revisar contratos/DPA e locais de tratamento de Firebase/Google e Asaas.
- Definir política de retenção final.
- Definir responsável por privacidade e canal oficial.
- Criar rotina de backup, restauração e teste de incidente.
- Ativar MFA para administração/equipe quando disponível no plano utilizado.
- Configurar Firebase App Check e alertas de orçamento/segurança após homologação.
- Migrar e eliminar anexos legados em base64 existentes no Firestore.
