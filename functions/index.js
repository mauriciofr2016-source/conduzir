"use strict";

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const { createAsaasClient } = require("./lib/asaas");
const {
  addDays,
  digitsOnly,
  isValidWebhookToken,
  makeExternalReference,
  normalizeCycle,
  parseCompanyUid,
  resolveCompanyPaymentState,
  safeDocumentId,
  toDateOnly
} = require("./lib/billing");

initializeApp();

const db = getFirestore();
const asaasApiKey = defineSecret("ASAAS_API_KEY");
const asaasWebhookToken = defineSecret("ASAAS_WEBHOOK_TOKEN");
const asaasEnvironment = defineString("ASAAS_ENV", { default: "sandbox" });
const asaasBillingType = defineString("ASAAS_BILLING_TYPE", { default: "UNDEFINED" });
const REGION = "southamerica-east1";
const CHECKOUT_LOCK_MINUTES = 3;

function setCors(req, res) {
  const origin = req.get("origin");
  if (origin) res.set("access-control-allow-origin", origin);
  res.set("vary", "Origin");
  res.set("access-control-allow-headers", "Authorization, Content-Type");
  res.set("access-control-allow-methods", "POST, OPTIONS");
}

function sendError(res, status, code, message) {
  return res.status(status).json({ error: code, message });
}

async function authenticateCompany(req) {
  const authorization = `${req.get("authorization") || ""}`;
  if (!authorization.startsWith("Bearer ")) throw Object.assign(new Error("AUTH_REQUIRED"), { status: 401 });
  const decoded = await getAuth().verifyIdToken(authorization.slice(7));
  if (!decoded.uid) throw Object.assign(new Error("AUTH_REQUIRED"), { status: 401 });
  return decoded;
}

async function getCatalogPlan(planCode) {
  const snapshot = await db.collection("catalog_items")
    .where("code", "==", planCode)
    .limit(1)
    .get();
  if (snapshot.empty) throw Object.assign(new Error("PLAN_NOT_FOUND"), { status: 404 });
  const plan = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  const audience = `${plan.audience || "company"}`.toLowerCase();
  if (plan.active === false || plan.type !== "plan" || audience !== "company") {
    throw Object.assign(new Error("PLAN_UNAVAILABLE"), { status: 409 });
  }
  const price = Number(plan.price);
  if (!Number.isFinite(price) || price <= 0) throw Object.assign(new Error("PLAN_PRICE_INVALID"), { status: 409 });
  return plan;
}

async function reserveCheckout(companyRef, planCode) {
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(companyRef);
    if (!snapshot.exists) throw Object.assign(new Error("COMPANY_NOT_FOUND"), { status: 404 });
    const company = snapshot.data();
    const lockAt = company.billingCheckoutLockedAt?.toDate?.();
    if (lockAt && Date.now() - lockAt.getTime() < CHECKOUT_LOCK_MINUTES * 60 * 1000) {
      throw Object.assign(new Error("CHECKOUT_IN_PROGRESS"), { status: 409 });
    }
    transaction.update(companyRef, {
      billingCheckoutLockedAt: FieldValue.serverTimestamp(),
      billingCheckoutPlanCode: planCode,
      updatedAt: FieldValue.serverTimestamp()
    });
  });
}

async function releaseCheckout(companyRef, errorMessage = "") {
  await companyRef.set({
    billingCheckoutLockedAt: FieldValue.delete(),
    billingCheckoutPlanCode: FieldValue.delete(),
    billingCheckoutError: errorMessage || FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

async function ensureAsaasCustomer(client, companyRef, company) {
  if (company.asaasCustomerId) {
    try {
      await client.getCustomer(company.asaasCustomerId);
      return company.asaasCustomerId;
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }

  const cpfCnpj = digitsOnly(company.cnpj);
  if (![11, 14].includes(cpfCnpj.length)) {
    throw Object.assign(new Error("COMPANY_DOCUMENT_REQUIRED"), { status: 422 });
  }
  const customer = await client.createCustomer({
    name: `${company.empresa || company.nome || "Empresa"}`.trim(),
    cpfCnpj,
    email: `${company.email || company.authEmail || ""}`.trim(),
    mobilePhone: digitsOnly(company.telefone),
    externalReference: company.uid || companyRef.id,
    notificationDisabled: false
  });
  await companyRef.set({
    asaasCustomerId: customer.id,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return customer.id;
}

function checkoutUrlFrom(resource) {
  return resource?.invoiceUrl || resource?.bankSlipUrl || resource?.transactionReceiptUrl || "";
}

async function findFirstSubscriptionPayment(client, subscriptionId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const payments = await client.listSubscriptionPayments(subscriptionId);
    if (payments?.data?.[0]) return payments.data[0];
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return null;
}

exports.createAsaasCheckout = onRequest({
  region: REGION,
  secrets: [asaasApiKey],
  timeoutSeconds: 60,
  memory: "256MiB"
}, async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return sendError(res, 405, "METHOD_NOT_ALLOWED", "Use POST.");

  let companyRef;
  try {
    const auth = await authenticateCompany(req);
    const planCode = `${req.body?.planCode || ""}`.trim();
    if (!planCode) return sendError(res, 400, "PLAN_CODE_REQUIRED", "Informe o plano.");

    companyRef = db.collection("companies").doc(auth.uid);
    await reserveCheckout(companyRef, planCode);
    const [companySnapshot, plan, billingSnapshot] = await Promise.all([
      companyRef.get(),
      getCatalogPlan(planCode),
      db.collection("billing_settings").doc("main").get()
    ]);
    const company = { uid: auth.uid, ...companySnapshot.data() };
    const billing = billingSnapshot.exists ? billingSnapshot.data() : {};
    const client = createAsaasClient({
      apiKey: asaasApiKey.value(),
      environment: asaasEnvironment.value()
    });
    const customerId = await ensureAsaasCustomer(client, companyRef, company);
    const contractedAt = new Date();
    const trialDays = Math.max(0, Number(billing.trialDays || 0));
    const dueDate = toDateOnly(addDays(contractedAt, trialDays));
    const cycle = normalizeCycle(plan.billingCycle);
    const externalReference = makeExternalReference(auth.uid, plan.code);
    const commonPayload = {
      customer: customerId,
      billingType: asaasBillingType.value(),
      value: Number(plan.price),
      description: `${plan.title} - Conduzir Talentos`.slice(0, 500),
      externalReference
    };

    let subscription = null;
    let payment = null;
    if (cycle === "avulso") {
      payment = await client.createPayment({ ...commonPayload, dueDate });
    } else {
      subscription = await client.createSubscription({
        ...commonPayload,
        nextDueDate: dueDate,
        cycle
      });
      payment = await findFirstSubscriptionPayment(client, subscription.id);
    }

    const sessionRef = db.collection("payment_sessions").doc();
    const historyRef = payment?.id ? db.collection("payment_history").doc(payment.id) : null;
    const contract = {
      planCode: plan.code,
      planName: plan.title,
      contractedPlanPrice: Number(plan.price),
      contractedAt: Timestamp.fromDate(contractedAt),
      billingCycle: plan.billingCycle || "mensal",
      asaasCustomerId: customerId,
      asaasSubscriptionId: subscription?.id || "",
      asaasPaymentId: payment?.id || "",
      paymentStatus: "Pendente",
      planActive: false,
      status: "Pendente",
      updatedAt: FieldValue.serverTimestamp()
    };
    const batch = db.batch();
    batch.set(companyRef, {
      ...contract,
      billingCheckoutLockedAt: FieldValue.delete(),
      billingCheckoutPlanCode: FieldValue.delete(),
      billingCheckoutError: FieldValue.delete()
    }, { merge: true });
    batch.set(sessionRef, {
      companyUid: auth.uid,
      companyName: company.empresa || "Empresa",
      contactEmail: company.email || auth.email || "",
      ...contract,
      provider: "asaas",
      gatewaySessionId: payment?.id || subscription?.id || "",
      status: "Aguardando pagamento",
      sessionUrl: checkoutUrlFrom(payment),
      createdAt: FieldValue.serverTimestamp()
    });
    if (historyRef) {
      batch.set(historyRef, {
        companyUid: auth.uid,
        planCode: plan.code,
        planName: plan.title,
        contractedPlanPrice: Number(plan.price),
        amount: Number(payment.value ?? plan.price),
        paidAmount: 0,
        billingCycle: plan.billingCycle || "mensal",
        provider: "asaas",
        asaasPaymentId: payment.id,
        asaasSubscriptionId: subscription?.id || payment.subscription || "",
        status: payment.status || "PENDING",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
    await batch.commit();

    return res.status(201).json({
      sessionId: sessionRef.id,
      asaasCustomerId: customerId,
      asaasSubscriptionId: subscription?.id || "",
      asaasPaymentId: payment?.id || "",
      status: "Aguardando pagamento",
      url: checkoutUrlFrom(payment)
    });
  } catch (error) {
    logger.error("Falha ao criar checkout Asaas", {
      code: error.message,
      status: error.status,
      details: error.details
    });
    if (companyRef) await releaseCheckout(companyRef, error.message).catch(() => {});
    const status = Number(error.status) || (error.code?.startsWith("auth/") ? 401 : 500);
    const publicMessages = {
      AUTH_REQUIRED: "Faça login novamente.",
      COMPANY_NOT_FOUND: "Cadastro da empresa não encontrado.",
      COMPANY_DOCUMENT_REQUIRED: "Informe um CPF ou CNPJ válido no cadastro da empresa.",
      PLAN_NOT_FOUND: "Plano não encontrado.",
      PLAN_UNAVAILABLE: "Plano indisponível.",
      PLAN_PRICE_INVALID: "Preço do plano inválido.",
      CHECKOUT_IN_PROGRESS: "Já existe uma contratação em andamento."
    };
    return sendError(res, status, error.message || "CHECKOUT_FAILED",
      publicMessages[error.message] || "Não foi possível iniciar a cobrança.");
  }
});

async function findCompanyForPayment(payment) {
  const externalUid = parseCompanyUid(payment?.externalReference);
  if (externalUid) {
    const direct = await db.collection("companies").doc(externalUid).get();
    if (direct.exists) return direct;
  }
  if (payment?.subscription) {
    const bySubscription = await db.collection("companies")
      .where("asaasSubscriptionId", "==", payment.subscription).limit(1).get();
    if (!bySubscription.empty) return bySubscription.docs[0];
  }
  if (payment?.customer) {
    const byCustomer = await db.collection("companies")
      .where("asaasCustomerId", "==", payment.customer).limit(1).get();
    if (!byCustomer.empty) return byCustomer.docs[0];
  }
  return null;
}

exports.asaasWebhook = onRequest({
  region: REGION,
  secrets: [asaasWebhookToken],
  timeoutSeconds: 30,
  memory: "256MiB"
}, async (req, res) => {
  if (req.method !== "POST") return sendError(res, 405, "METHOD_NOT_ALLOWED", "Use POST.");
  if (!isValidWebhookToken(req.get("asaas-access-token"), asaasWebhookToken.value())) {
    return sendError(res, 401, "INVALID_WEBHOOK_TOKEN", "Token inválido.");
  }

  const event = req.body || {};
  if (!event.id || !event.event) return sendError(res, 400, "INVALID_EVENT", "Evento inválido.");
  const eventRef = db.collection("asaas_webhook_events").doc(safeDocumentId(event.id));
  try {
    const alreadyProcessed = await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(eventRef);
      const existingData = existing.data();
      const processingAt = existingData?.updatedAt?.toMillis?.() || 0;
      const processingIsStale = existingData?.status === "processing"
        && Date.now() - processingAt > 5 * 60 * 1000;
      if (existing.exists && existingData.status !== "failed" && !processingIsStale) return true;
      transaction.set(eventRef, {
        asaasEventId: event.id,
        eventType: event.event,
        paymentId: event.payment?.id || "",
        status: "processing",
        receivedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return false;
    });
    if (alreadyProcessed) return res.status(200).json({ received: true, duplicate: true });

    const payment = event.payment;
    if (!payment?.id) {
      await eventRef.set({ status: "ignored", processedAt: FieldValue.serverTimestamp() }, { merge: true });
      return res.status(200).json({ received: true, ignored: true });
    }
    const companyDoc = await findCompanyForPayment(payment);
    if (!companyDoc) {
      await eventRef.set({
        status: "unmatched",
        processedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      logger.warn("Cobrança Asaas sem empresa correspondente", { paymentId: payment.id, event: event.event });
      return res.status(200).json({ received: true, unmatched: true });
    }

    const company = companyDoc.data();
    const state = resolveCompanyPaymentState(company, payment);
    const amount = Number(payment.value || 0);
    const paidAmount = state.paid ? Number(payment.value || 0) : 0;
    const latestDueDate = `${payment.dueDate || ""}` >= `${company.lastPaymentDueDate || ""}`
      ? `${payment.dueDate || company.lastPaymentDueDate || ""}`
      : `${company.lastPaymentDueDate || ""}`;
    const historyRef = db.collection("payment_history").doc(payment.id);
    const batch = db.batch();
    batch.set(companyDoc.ref, {
      asaasCustomerId: payment.customer || company.asaasCustomerId || "",
      asaasSubscriptionId: payment.subscription || company.asaasSubscriptionId || "",
      asaasPaymentId: payment.id,
      paymentStatus: state.paymentStatus,
      planActive: state.planActive,
      status: state.accountStatus,
      lastPaymentEvent: event.event,
      lastPaymentStatus: payment.status || "",
      lastPaymentDueDate: latestDueDate,
      lastPaymentAt: state.paid && state.changesAccess
        ? FieldValue.serverTimestamp()
        : (company.lastPaymentAt || null),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    batch.set(historyRef, {
      companyUid: companyDoc.id,
      planCode: company.planCode || "",
      planName: company.planName || "",
      contractedPlanPrice: Number(company.contractedPlanPrice || amount),
      amount,
      paidAmount,
      billingCycle: company.billingCycle || "",
      provider: "asaas",
      asaasPaymentId: payment.id,
      asaasSubscriptionId: payment.subscription || company.asaasSubscriptionId || "",
      invoiceUrl: checkoutUrlFrom(payment),
      dueDate: payment.dueDate || "",
      paymentDate: payment.paymentDate || payment.clientPaymentDate || "",
      status: payment.status || "",
      eventType: event.event,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    batch.set(eventRef, {
      status: "processed",
      companyUid: companyDoc.id,
      processedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await batch.commit();
    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error("Falha ao processar webhook Asaas", { eventId: event.id, error: error.message });
    await eventRef.set({
      status: "failed",
      error: `${error.message || "WEBHOOK_FAILED"}`.slice(0, 500),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true }).catch(() => {});
    return sendError(res, 500, "WEBHOOK_FAILED", "Falha temporária.");
  }
});
