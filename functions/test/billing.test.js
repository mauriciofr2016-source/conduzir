"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isValidWebhookToken,
  normalizeCycle,
  parseCompanyUid,
  paymentState,
  resolveCompanyPaymentState
} = require("../lib/billing");
const {
  getAsaasBaseUrl,
  normalizeAsaasEnvironment
} = require("../lib/asaas");

test("normaliza ciclos comerciais para o Asaas", () => {
  assert.equal(normalizeCycle("mensal"), "MONTHLY");
  assert.equal(normalizeCycle("trimestral"), "QUARTERLY");
  assert.equal(normalizeCycle("avulso"), "avulso");
});

test("resolve ambiente e baseURL corretos do Asaas", () => {
  assert.equal(normalizeAsaasEnvironment("prod"), "production");
  assert.equal(normalizeAsaasEnvironment("produção"), "production");
  assert.equal(normalizeAsaasEnvironment("sandbox"), "sandbox");
  assert.equal(getAsaasBaseUrl("production"), "https://api.asaas.com/v3");
  assert.equal(getAsaasBaseUrl("sandbox"), "https://sandbox.asaas.com/api/v3");
});

test("libera o plano apenas para pagamento confirmado", () => {
  assert.deepEqual(paymentState("RECEIVED"), {
    paymentStatus: "Ativo",
    planActive: true,
    accountStatus: "Ativo",
    paid: true
  });
  assert.equal(paymentState("OVERDUE").planActive, false);
  assert.equal(paymentState("PENDING").planActive, false);
});

test("valida token do webhook sem comparação simples", () => {
  assert.equal(isValidWebhookToken("segredo-forte", "segredo-forte"), true);
  assert.equal(isValidWebhookToken("segredo-fraco", "segredo-forte"), false);
});

test("recupera uid da referência externa", () => {
  assert.equal(parseCompanyUid("uid-123:plano-premium"), "uid-123");
});

test("cobrança futura pendente não bloqueia assinatura já paga", () => {
  const result = resolveCompanyPaymentState(
    { planActive: true, paymentStatus: "Ativo", status: "Ativo", lastPaymentDueDate: "2026-07-10" },
    { status: "PENDING", dueDate: "2026-08-10" }
  );
  assert.equal(result.planActive, true);
  assert.equal(result.paymentStatus, "Ativo");
  assert.equal(result.changesAccess, false);
});

test("evento antigo não regride o estado comercial atual", () => {
  const result = resolveCompanyPaymentState(
    { planActive: true, paymentStatus: "Ativo", status: "Ativo", lastPaymentDueDate: "2026-08-10" },
    { status: "OVERDUE", dueDate: "2026-07-10" }
  );
  assert.equal(result.planActive, true);
  assert.equal(result.paymentStatus, "Ativo");
});
