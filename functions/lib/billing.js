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
const DEFAULT_PERMISSIONS = {
  curriculumAccess: false,
  selfServiceHiring: false,
  consultancy: false,
  managedRecruitment: false,
  nr1: false,
  reports: false
};

function digitsOnly(value) {
  return `${value || ""}`.replace(/\D/g, "");
}

function normalizeCycle(value) {
  const normalized = `${value || "mensal"}`.trim().toLowerCase();
  return normalized === "avulso" ? "avulso" : (CYCLE_MAP[normalized] || "MONTHLY");
}

function normalizeCatalogCode(value) {
  return `${value || ""}`.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePermissions(value = {}) {
  return Object.fromEntries(
    Object.keys(DEFAULT_PERMISSIONS).map((key) => [key, value?.[key] === true])
  );
}

function normalizeCatalogItem(raw = {}, id = "") {
  const type = `${raw.type || raw.itemType || "plan"}`.trim().toLowerCase() === "service" ? "service" : "plan";
  const audience = `${raw.audience || (type === "plan" ? "company" : "company_service")}`.trim().toLowerCase();
  const billingCycle = `${raw.billingCycle || raw.billingMode || (type === "service" ? "avulso" : "mensal")}`.trim().toLowerCase();
  const price = Number(raw.price);
  const code = normalizeCatalogCode(raw.code || id);
  const title = `${raw.title || raw.name || ""}`.trim();
  const deleted = raw.deleted === true || raw.deletedAt || `${raw.status || ""}`.trim().toLowerCase() === "excluído";
  return {
    ...raw,
    id,
    code,
    name: title,
    title,
    description: `${raw.description || raw.shortDescription || ""}`.trim(),
    price,
    active: raw.active !== false && !deleted,
    type,
    itemType: type,
    audience,
    billingMode: billingCycle === "avulso" ? "one_time" : "recurring",
    billingCycle,
    recurring: type === "plan" && billingCycle !== "avulso",
    permissions: normalizePermissions(raw.permissions),
    deleted: Boolean(deleted)
  };
}

function validateCatalogItemForCheckout(item = {}) {
  if (!item.id && !item.code) throw Object.assign(new Error("CATALOG_ITEM_NOT_FOUND"), { status: 404 });
  if (item.deleted || item.active === false) throw Object.assign(new Error("CATALOG_ITEM_UNAVAILABLE"), { status: 409 });
  if (!["plan", "service"].includes(item.type)) throw Object.assign(new Error("CATALOG_ITEM_TYPE_INVALID"), { status: 409 });
  if (!item.title) throw Object.assign(new Error("CATALOG_ITEM_NAME_REQUIRED"), { status: 409 });
  if (!Number.isFinite(item.price) || item.price <= 0) throw Object.assign(new Error("CATALOG_ITEM_PRICE_INVALID"), { status: 409 });
  if (!item.billingCycle) throw Object.assign(new Error("CATALOG_ITEM_CYCLE_INVALID"), { status: 409 });
  if (item.type === "plan" && item.billingCycle === "avulso") throw Object.assign(new Error("CATALOG_ITEM_CYCLE_INVALID"), { status: 409 });
  if (item.type === "service" && item.billingCycle !== "avulso") throw Object.assign(new Error("CATALOG_ITEM_CYCLE_INVALID"), { status: 409 });
  return item;
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
  DEFAULT_PERMISSIONS,
  PAID_STATUSES,
  addDays,
  digitsOnly,
  isValidWebhookToken,
  makeExternalReference,
  normalizeCatalogCode,
  normalizeCatalogItem,
  normalizeCycle,
  normalizePermissions,
  parseCompanyUid,
  paymentState,
  resolveCompanyPaymentState,
  safeDocumentId,
  toDateOnly,
  validateCatalogItemForCheckout
};
