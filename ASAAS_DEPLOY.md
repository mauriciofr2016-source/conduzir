# Implantação da integração Asaas

## Visão geral

A API Key do Asaas é lida somente pela Firebase Function `createAsaasCheckout`.
O navegador envia apenas o Firebase ID Token e o código do plano. A Function
consulta `catalog_items` no Firestore e usa o preço atual do catálogo para criar
novas contratações. Assinaturas existentes nunca são reajustadas por esse fluxo.

## Pré-requisitos

- Projeto Firebase `bancotalentoserika` no plano Blaze.
- Node.js 20 e Firebase CLI.
- Firebase Authentication e Firestore ativos.
- Conta Sandbox do Asaas para homologação.
- Cada plano empresarial publicado como documento em `catalog_items`, com
  `code`, `type: "plan"`, `audience: "company"`, `price`, `billingCycle` e
  `active: true`.
- Empresa com CNPJ/CPF válido salvo em `companies/{uid}`.

## 1. Instalar e autenticar

```powershell
npm install -g firebase-tools
firebase login
cd C:\Users\Lenovo\Documents\GitHub\conduzir
npm --prefix functions install
```

## 2. Cadastrar segredos

Nunca salve esses valores no frontend, Git ou arquivos `.env` versionados.

```powershell
firebase functions:secrets:set ASAAS_API_KEY
firebase functions:secrets:set ASAAS_WEBHOOK_TOKEN
```

Use um token de webhook forte, exclusivo e diferente da API Key.

Para homologação, crie `functions/.env.bancotalentoserika`:

```dotenv
ASAAS_ENV=sandbox
ASAAS_BILLING_TYPE=UNDEFINED
```

Em produção, altere `ASAAS_ENV` para `production` e cadastre uma API Key de
produção. `UNDEFINED` permite que o pagador escolha uma modalidade disponível.

## 3. Implantar

```powershell
firebase deploy --only firestore:rules,functions,hosting
```

O Hosting publica:

- Pagamento: `https://bancotalentoserika.web.app/api/asaas/checkout`
- Webhook: `https://bancotalentoserika.web.app/api/asaas/webhook`

No painel admin, defina o modo como `Endpoint seguro hospedado` e use
`/api/asaas/checkout` como endpoint de pagamento.

## 4. Configurar o webhook no Asaas

No Asaas, acesse **Integrações > Webhooks** e configure:

- URL: `https://bancotalentoserika.web.app/api/asaas/webhook`
- Token de autenticação: exatamente o valor de `ASAAS_WEBHOOK_TOKEN`
- Eventos: todos os eventos de cobrança/pagamento
- Fila ativa

O Asaas envia o token no header `asaas-access-token`. A Function compara o token
de forma segura, registra cada `event.id` e ignora entregas repetidas.

## 5. Homologar

1. Cadastre uma empresa de teste com CNPJ válido.
2. Confirme que o plano existe em `catalog_items`.
3. Contrate o plano pela área da empresa.
4. Verifique `asaasCustomerId`, `asaasSubscriptionId` e `asaasPaymentId` em
   `companies/{uid}`.
5. Pague a cobrança no Sandbox.
6. Confirme `paymentStatus: "Ativo"` e `planActive: true`.
7. Confira `payment_history/{asaasPaymentId}` com `amount` e `paidAmount`.
8. Reenvie o mesmo webhook e confirme que nenhum histórico é duplicado.
9. Altere o preço do catálogo e confirme que a assinatura já criada mantém
   `contractedPlanPrice`.

## Operação e diagnóstico

```powershell
firebase functions:log --only createAsaasCheckout,asaasWebhook
firebase functions:secrets:get ASAAS_API_KEY
firebase functions:secrets:get ASAAS_WEBHOOK_TOKEN
```

Eventos ficam em `asaas_webhook_events`. Estados `failed` devem ser investigados;
o Asaas repetirá eventos quando a Function responder com erro. Eventos
`unmatched` indicam cobrança sem `externalReference`, assinatura ou cliente
associado a uma empresa.

Reajustes de assinantes antigos não fazem parte dessas Functions. Quando essa
operação existir, deverá ser uma ação administrativa manual, explícita e
auditável.
