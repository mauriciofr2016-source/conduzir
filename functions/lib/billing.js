"use strict";

const crypto = require("node:crypto");

const CYCLE_MAP = {
  semanal: "WEEKLY",
  quinzenal: "BIWEEKLY",
  mensal: "MONTHLY",
  bimestral: "BIMONTHLY",
  trimestral: "QUARTERLY",
  semestral: "SEMIANNUALLY",
  anual: "YEARLY"
};

const PAID_STATUSES = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

function digitsOnly(value) {
  return `${value || ""}`.replace(/\D/g, "");
}

function normalizeCycle(value) {
  const normalized = `${value || "mensal"}`.trim().toLowerCase();
  return normalized === "avulso" ? "avulso" : (CYCLE_MAP[normalized] || "MONTHLY");
}

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + Number(days || 0));
  return result;
}

function makeExternalReference(companyUid, planCode) {
  return `${companyUid}:${planCode}`.slice(0, 100);
}

function parseCompanyUid(externalReference) {
  return `${externalReference || ""}`.split(":")[0].trim();
}

function safeDocumentId(value) {
  return crypto.createHash("sha256").update(`${value || ""}`).digest("hex");
}

function paymentState(status) {
  const normalized = `${status || ""}`.toUpperCase();
  if (PAID_STATUSES.has(normalized)) {
    return { paymentStatus: "Ativo", planActive: true, accountStatus: "Ativo", paid: true };
  }
  if (normalized === "OVERDUE") {
    return { paymentStatus: "Vencido", planActive: false, accountStatus: "Pendente", paid: false };
  }
  if (["REFUNDED", "REFUND_REQUESTED"].includes(normalized)) {
    return { paymentStatus: "Reembolsado", planActive: false, accountStatus: "Pendente", paid: false };
  }
  if (normalized.includes("CHARGEBACK")) {
    return { paymentStatus: "Chargeback", planActive: false, accountStatus: "Pendente", paid: false };
  }
  if (["DELETED", "CANCELLED", "CANCELED"].includes(normalized)) {
    return { paymentStatus: "Cancelado", planActive: false, accountStatus: "Pendente", paid: false };
  }
  return { paymentStatus: "Pendente", planActive: false, accountStatus: "Pendente", paid: false };
}

function resolveCompanyPaymentState(company, payment) {
  const next = paymentState(payment?.status);
  const currentDueDate = `${company?.lastPaymentDueDate || ""}`;
  const eventDueDate = `${payment?.dueDate || ""}`;
  const isOlderEvent = currentDueDate && eventDueDate && eventDueDate < currentDueDate;
  const isPending = next.paymentStatus === "Pendente";
  if (isOlderEvent || (isPending && company?.planActive === true)) {
    return {
      ...next,
      paymentStatus: company?.paymentStatus || "Pendente",
      planActive: company?.planActive === true,
      accountStatus: company?.status || "Pendente",
      changesAccess: false
    };
  }
  return { ...next, changesAccess: true };
}

function isValidWebhookToken(received, expected) {
  const left = Buffer.from(`${received || ""}`);
  const right = Buffer.from(`${expected || ""}`);
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

module.exports = {
  PAID_STATUSES,
  addDays,
  digitsOnly,
  isValidWebhookToken,
  makeExternalReference,
  normalizeCycle,
  parseCompanyUid,
  paymentState,
  resolveCompanyPaymentState,
  safeDocumentId,
  toDateOnly
};
