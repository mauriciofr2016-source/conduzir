"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isValidWebhookToken,
  normalizeCatalogItem,
  normalizeCycle,
  parseCompanyUid,
  paymentState,
  resolveBillingDocument,
  resolveCompanyPaymentState,
  validateCatalogItemForCheckout
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

test("normaliza contrato de item de catalogo dinamico", () => {
  const item = normalizeCatalogItem({
    name: "Plano Teste",
    price: "1",
    itemType: "plan",
    billingCycle: "mensal",
    permissions: { reports: true }
  }, "plano-teste");
  assert.equal(item.id, "plano-teste");
  assert.equal(item.code, "plano-teste");
  assert.equal(item.title, "Plano Teste");
  assert.equal(item.itemType, "plan");
  assert.equal(item.billingMode, "recurring");
  assert.equal(item.recurring, true);
  assert.equal(item.permissions.reports, true);
});

test("valida plano mensal e servico avulso para checkout", () => {
  assert.doesNotThrow(() => validateCatalogItemForCheckout(normalizeCatalogItem({
    title: "Plano Mensal",
    price: 1,
    type: "plan",
    billingCycle: "mensal",
    active: true
  }, "plano-mensal")));
  assert.doesNotThrow(() => validateCatalogItemForCheckout(normalizeCatalogItem({
    title: "Servico Avulso",
    price: 99,
    type: "service",
    billingCycle: "avulso",
    active: true
  }, "servico-avulso")));
});

test("normaliza ciclos inconsistentes cadastrados pelo admin", () => {
  const plan = validateCatalogItemForCheckout(normalizeCatalogItem({
    title: "Plano Corrigido",
    price: 197,
    type: "plan",
    billingCycle: "avulso",
    active: true
  }, "plano-corrigido"));
  assert.equal(plan.billingCycle, "mensal");
  assert.equal(plan.billingMode, "recurring");
  assert.equal(plan.recurring, true);

  const service = validateCatalogItemForCheckout(normalizeCatalogItem({
    title: "Servico Corrigido",
    price: 300,
    type: "service",
    billingCycle: "mensal",
    active: true
  }, "servico-corrigido"));
  assert.equal(service.billingCycle, "avulso");
  assert.equal(service.billingMode, "one_time");
  assert.equal(service.recurring, false);
});

test("bloqueia catalogo excluido, inativo ou com preco invalido", () => {
  assert.throws(() => validateCatalogItemForCheckout(normalizeCatalogItem({
    title: "Plano Excluido",
    price: 1,
    type: "plan",
    billingCycle: "mensal",
    deleted: true
  }, "plano-excluido")), /CATALOG_ITEM_UNAVAILABLE/);
  assert.throws(() => validateCatalogItemForCheckout(normalizeCatalogItem({
    title: "Plano Inativo",
    price: 1,
    type: "plan",
    billingCycle: "mensal",
    active: false
  }, "plano-inativo")), /CATALOG_ITEM_UNAVAILABLE/);
  assert.throws(() => validateCatalogItemForCheckout(normalizeCatalogItem({
    title: "Plano Gratis",
    price: 0,
    type: "plan",
    billingCycle: "mensal"
  }, "plano-gratis")), /CATALOG_ITEM_PRICE_INVALID/);
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

test("aceita CPF ou CNPJ em campos de cobranca da empresa", () => {
  assert.equal(resolveBillingDocument("", "123.456.789-09"), "12345678909");
  assert.equal(resolveBillingDocument(null, "12.345.678/0001-90"), "12345678000190");
  assert.equal(resolveBillingDocument("1234"), "");
});

test("preserva regra de entrega do item de catalogo", () => {
  const item = normalizeCatalogItem({
    title: "Orientacao de carreira",
    price: 50,
    type: "service",
    deliveryRule: {
      assignee: "admin",
      completionAction: "candidate_report",
      exposeToBuyer: true,
      updateCandidateProfile: true,
      statusOnComplete: "Relatorio liberado"
    }
  }, "orientacao-carreira");
  assert.equal(item.deliveryRule.assignee, "admin");
  assert.equal(item.deliveryRule.completionAction, "candidate_report");
  assert.equal(item.deliveryRule.updateCandidateProfile, true);
  assert.equal(item.deliveryRule.statusOnComplete, "Relatorio liberado");
});
