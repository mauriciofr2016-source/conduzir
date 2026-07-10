"use strict";

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const { createAsaasClient, getAsaasBaseUrl, normalizeAsaasEnvironment } = require("./lib/asaas");
const {
  addDays,
  digitsOnly,
  isValidWebhookToken,
  makeExternalReference,
  normalizeCatalogCode,
  normalizeCatalogItem,
  normalizeCycle,
  normalizePermissions,
  parseCompanyUid,
  resolveCompanyPaymentState,
  safeDocumentId,
  toDateOnly,
  validateCatalogItemForCheckout
} = require("./lib/billing");

const PROJECT_ID = "bancotalentoserika";
const adminApp = initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(adminApp);
const asaasApiKey = defineSecret("ASAAS_API_KEY");
const asaasWebhookToken = defineSecret("ASAAS_WEBHOOK_TOKEN");
const asaasEnvironment = defineString("ASAAS_ENV", { default: "sandbox" });
const asaasBillingType = defineString("ASAAS_BILLING_TYPE", { default: "UNDEFINED" });
const REGION = "southamerica-east1";
const CHECKOUT_LOCK_MINUTES = 3;
const ALLOWED_ORIGINS = new Set([
  "https://mauriciofr2016-source.github.io",
  "https://bancotalentoserika.web.app",
  "https://bancotalentoserika.firebaseapp.com"
]);

function setCors(req, res) {
  const origin = req.get("origin");
  if (origin && (ALLOWED_ORIGINS.has(origin) || origin.endsWith(".web.app") || origin.endsWith(".firebaseapp.com"))) {
    res.set("access-control-allow-origin", origin);
  }
  res.set("vary", "Origin");
  res.set("access-control-allow-headers", "Authorization, Content-Type");
  res.set("access-control-allow-methods", "POST, OPTIONS");
}

function sendError(res, status, code, message) {
  return res.status(status).json({ error: code, message });
}

function maskToken(value) {
  const token = `${value || ""}`;
  if (!token) return "";
  if (token.length <= 16) return `${token.slice(0, 4)}...`;
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

function sanitizedHeaders(req) {
  const headers = { ...req.headers };
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === "authorization") {
      const value = `${headers[key] || ""}`;
      const token = value.replace(/^Bearer\s+/i, "");
      headers[key] = value ? `Bearer ${maskToken(token)} (len=${token.length})` : "";
    }
  }
  return headers;
}

function getAuthorizationHeader(req) {
  return `${req.headers?.authorization || req.headers?.Authorization || req.get("authorization") || req.get("Authorization") || ""}`;
}

function authDebug(req, step, extra = {}) {
  logger.info("asaasCheckoutDebug", {
    step,
    method: req.method,
    origin: req.get("origin") || "",
    path: req.path || "",
    configuredProjectId: PROJECT_ID,
    adminProjectId: adminApp.options?.projectId || "",
    ...extra
  });
}

function getCatalogItemKind(item = {}) {
  const type = `${item.type || ""}`.trim().toLowerCase();
  const cycle = normalizeCycle(item.billingCycle);
  return type === "service" || cycle === "avulso" ? "service" : "subscription";
}

async function findCatalogItem(identifier) {
  const id = `${identifier || ""}`.trim();
  if (!id) return null;
  const direct = await db.collection("catalog_items").doc(id).get();
  if (direct.exists) return normalizeCatalogItem(direct.data(), direct.id);
  const code = normalizeCatalogCode(id);
  if (!code) return null;
  const snapshot = await db.collection("catalog_items")
    .where("code", "==", code)
    .limit(1)
    .get();
  return snapshot.empty ? null : normalizeCatalogItem(snapshot.docs[0].data(), snapshot.docs[0].id);
}

async function authenticateCompany(req) {
  const authorization = getAuthorizationHeader(req);
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const hasBearer = /^Bearer\s+/i.test(authorization);
  authDebug(req, "auth_header_received", {
    hasAuthorization: Boolean(authorization),
    hasBearer,
    tokenLength: token.length,
    authorizationHeaderSource: req.headers?.authorization ? "req.headers.authorization" : (req.headers?.Authorization ? "req.headers.Authorization" : "req.get"),
    authorizationPreview: token ? maskToken(token) : ""
  });
  if (!authorization) {
    authDebug(req, "returning_401", { reason: "401_TOKEN_MISSING" });
    throw Object.assign(new Error("401_TOKEN_MISSING"), { status: 401 });
  }
  if (!hasBearer || !token) {
    authDebug(req, "returning_401", { reason: "401_TOKEN_INVALID", detail: "missing_bearer" });
    throw Object.assign(new Error("401_TOKEN_INVALID"), { status: 401 });
  }
  let decoded;
  try {
    decoded = await getAuth(adminApp).verifyIdToken(token);
    authDebug(req, "verify_id_token_success", {
      verified: true,
      uid: decoded.uid || "",
      email: decoded.email || "",
      aud: decoded.aud || "",
      iss: decoded.iss || ""
    });
  } catch (error) {
    logger.warn("Token Firebase invalido no checkout Asaas", {
      code: error.code,
      message: error.message,
      name: error.name || "",
      stack: error.stack || "",
      origin: req.get("origin") || "",
      hasAuthorizationHeader: Boolean(authorization),
      hasBearer,
      tokenLength: token.length,
      configuredProjectId: PROJECT_ID,
      adminProjectId: adminApp.options?.projectId || ""
    });
    authDebug(req, "returning_401", {
      reason: "401_TOKEN_INVALID",
      verifyCode: error.code || "",
      verifyMessage: error.message || "",
      verifyStack: error.stack || ""
    });
    throw Object.assign(new Error("401_TOKEN_INVALID"), { status: 401 });
  }
  if (!decoded.uid) {
    authDebug(req, "returning_401", { reason: "401_TOKEN_INVALID", detail: "decoded_uid_missing" });
    throw Object.assign(new Error("401_TOKEN_INVALID"), { status: 401 });
  }
  if (decoded.aud && decoded.aud !== PROJECT_ID) {
    logger.warn("Token Firebase de projeto diferente no checkout Asaas", {
      aud: decoded.aud,
      expected: PROJECT_ID,
      uid: decoded.uid
    });
    authDebug(req, "returning_401", {
      reason: "401_TOKEN_INVALID",
      detail: "project_mismatch",
      aud: decoded.aud,
      expected: PROJECT_ID,
      uid: decoded.uid
    });
    throw Object.assign(new Error("401_TOKEN_INVALID"), { status: 401 });
  }
  try {
    const userRecord = await getAuth(adminApp).getUser(decoded.uid);
    authDebug(req, "auth_user_lookup_success", {
      uid: userRecord.uid,
      email: userRecord.email || "",
      disabled: Boolean(userRecord.disabled)
    });
    if (userRecord.disabled) {
      authDebug(req, "returning_401", { reason: "401_TOKEN_INVALID", detail: "user_disabled", uid: decoded.uid });
      throw Object.assign(new Error("401_TOKEN_INVALID"), { status: 401 });
    }
  } catch (error) {
    if (error.message === "401_TOKEN_INVALID") throw error;
    logger.warn("Usuário Firebase Auth não encontrado no checkout Asaas", {
      uid: decoded.uid,
      code: error.code || "",
      message: error.message || ""
    });
    authDebug(req, "returning_401", {
      reason: "401_TOKEN_INVALID",
      uid: decoded.uid,
      lookupCode: error.code || "",
      lookupMessage: error.message || ""
    });
    throw Object.assign(new Error("401_TOKEN_INVALID"), { status: 401 });
  }
  authDebug(req, "auth_uid_found", { uid: decoded.uid, email: decoded.email || "" });
  return decoded;
}

async function getCatalogCheckoutItem(identifier) {
  const item = await findCatalogItem(identifier);
  if (!item) throw Object.assign(new Error("CATALOG_ITEM_NOT_FOUND"), { status: 404 });
  const audience = `${item.audience || "company"}`.toLowerCase();
  const type = `${item.type || "plan"}`.toLowerCase();
  const audienceAllowed = type === "service"
    ? ["company", "company_service", "candidate_service"].includes(audience)
    : audience === "company";
  if (item.deleted || item.active === false || !audienceAllowed || !["plan", "service"].includes(type)) {
    throw Object.assign(new Error("CATALOG_ITEM_UNAVAILABLE"), { status: 409 });
  }
  return validateCatalogItemForCheckout({
    ...item,
    type,
    audience,
    permissions: normalizePermissions(item.permissions)
  });
}

async function reserveCheckout(companyRef, item) {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(companyRef);
    if (!snapshot.exists) throw Object.assign(new Error("403_COMPANY_NOT_FOUND"), { status: 403 });
    const company = snapshot.data();
    const now = Date.now();
    const lockAt = company.billingCheckoutLockedAt?.toDate?.();
    if (lockAt && now - lockAt.getTime() < CHECKOUT_LOCK_MINUTES * 60 * 1000) {
      throw Object.assign(new Error("CHECKOUT_IN_PROGRESS"), { status: 409 });
    }
    const itemKind = getCatalogItemKind(item);
    const idempotencyKey = safeDocumentId(`${companyRef.id}:${item.id}:${itemKind}:${Math.floor(now / (CHECKOUT_LOCK_MINUTES * 60 * 1000))}`);
    const sessionRef = db.collection("payment_sessions").doc(idempotencyKey);
    const sessionSnapshot = await transaction.get(sessionRef);
    const session = sessionSnapshot.exists ? sessionSnapshot.data() : null;
    if (session?.status === "Aguardando pagamento" && session?.sessionUrl) {
      return { duplicate: true, sessionRef, session };
    }
    transaction.update(companyRef, {
      billingCheckoutLockedAt: FieldValue.serverTimestamp(),
      billingCheckoutCatalogItemId: item.id,
      billingCheckoutPlanCode: item.code,
      updatedAt: FieldValue.serverTimestamp()
    });
    transaction.set(sessionRef, {
      companyUid: companyRef.id,
      catalogItemId: item.id,
      planCode: item.code,
      itemKind,
      status: "Processando checkout",
      provider: "asaas",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { duplicate: false, sessionRef };
  });
}

async function releaseCheckout(companyRef, errorMessage = "") {
  await companyRef.set({
    billingCheckoutLockedAt: FieldValue.delete(),
    billingCheckoutCatalogItemId: FieldValue.delete(),
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
  invoker: "public",
  secrets: [asaasApiKey],
  timeoutSeconds: 60,
  memory: "256MiB"
}, async (req, res) => {
  setCors(req, res);
  authDebug(req, "request_received", {
    headers: sanitizedHeaders(req),
    bodyKeys: req.body && typeof req.body === "object" ? Object.keys(req.body) : [],
    catalogItemIdPreview: `${req.body?.catalogItemId || req.body?.planCode || ""}`.trim()
  });
  if (req.method === "OPTIONS") {
    authDebug(req, "preflight_options_return_204");
    return res.status(204).send("");
  }
  if (req.method !== "POST") return sendError(res, 405, "METHOD_NOT_ALLOWED", "Use POST.");

  let companyRef;
  try {
    const auth = await authenticateCompany(req);
    const catalogItemId = `${req.body?.catalogItemId || req.body?.itemId || req.body?.planCode || req.body?.itemCode || req.body?.serviceCode || ""}`.trim();
    if (!catalogItemId) return sendError(res, 400, "CATALOG_ITEM_ID_REQUIRED", "Informe o plano ou serviço.");

    companyRef = db.collection("companies").doc(auth.uid);
    const [item, billingSnapshot] = await Promise.all([
      getCatalogCheckoutItem(catalogItemId),
      db.collection("billing_settings").doc("main").get()
    ]);
    authDebug(req, "company_lookup_start", { uid: auth.uid, catalogItemId, resolvedCatalogItemId: item.id, planCode: item.code });
    const companySnapshot = await companyRef.get();
    authDebug(req, "company_lookup_result", {
      uid: auth.uid,
      companyFound: companySnapshot.exists,
      catalogItemId: item.id,
      planCode: item.code
    });
    if (!companySnapshot.exists) {
      authDebug(req, "returning_403", { reason: "403_COMPANY_NOT_FOUND", uid: auth.uid });
      throw Object.assign(new Error("403_COMPANY_NOT_FOUND"), { status: 403 });
    }
    const reservation = await reserveCheckout(companyRef, item);
    if (reservation.duplicate) {
      return res.status(200).json({
        sessionId: reservation.sessionRef.id,
        duplicate: true,
        itemKind: reservation.session.itemKind || getCatalogItemKind(item),
        itemType: item.type || "plan",
        status: reservation.session.status,
        url: reservation.session.sessionUrl || ""
      });
    }
    const itemKind = getCatalogItemKind(item);
    authDebug(req, "plan_lookup_result", {
      uid: auth.uid,
      planCode: item.code,
      catalogItemId: item.id,
      planFound: Boolean(item?.id),
      itemKind,
      itemType: item.type || ""
    });
    const companyData = companySnapshot.data() || {};
    if (companyData.uid && companyData.uid !== auth.uid) {
      authDebug(req, "returning_403", { reason: "403_COMPANY_NOT_ALLOWED", uid: auth.uid, companyUid: companyData.uid });
      throw Object.assign(new Error("403_COMPANY_NOT_ALLOWED"), { status: 403 });
    }
    const company = { uid: auth.uid, ...companyData };
    const billing = billingSnapshot.exists ? billingSnapshot.data() : {};
    const resolvedAsaasEnvironment = normalizeAsaasEnvironment(asaasEnvironment.value());
    const resolvedAsaasBaseUrl = getAsaasBaseUrl(resolvedAsaasEnvironment);
    logger.info("asaasCheckoutConfig", {
      asaasEnvironment: resolvedAsaasEnvironment,
      baseURL: resolvedAsaasBaseUrl,
      apiKeySource: "Firebase Functions Secret Manager: ASAAS_API_KEY"
    });
    const client = createAsaasClient({
      apiKey: asaasApiKey.value(),
      environment: resolvedAsaasEnvironment
    });
    const customerId = await ensureAsaasCustomer(client, companyRef, company);
    const contractedAt = new Date();
    const trialDays = Math.max(0, Number(billing.trialDays || 0));
    const dueDate = toDateOnly(addDays(contractedAt, trialDays));
    const cycle = normalizeCycle(item.billingCycle);
    const externalReference = makeExternalReference(auth.uid, `${itemKind}:${item.id}`);
    const serviceContext = req.body?.serviceContext && typeof req.body.serviceContext === "object"
      ? {
        candidateId: `${req.body.serviceContext.candidateId || ""}`.trim(),
        candidateName: `${req.body.serviceContext.candidateName || ""}`.trim(),
        candidateEmail: `${req.body.serviceContext.candidateEmail || ""}`.trim(),
        message: `${req.body.serviceContext.message || ""}`.trim()
      }
      : {};
    const commonPayload = {
      customer: customerId,
      billingType: asaasBillingType.value(),
      value: Number(item.price),
      description: `${item.title || item.name} - Conduzir Talentos`.slice(0, 500),
      externalReference
    };

    let subscription = null;
    let payment = null;
    if (itemKind === "service" || cycle === "avulso") {
      payment = await client.createPayment({ ...commonPayload, dueDate });
    } else {
      subscription = await client.createSubscription({
        ...commonPayload,
        nextDueDate: dueDate,
        cycle
      });
      payment = await findFirstSubscriptionPayment(client, subscription.id);
    }

    const sessionRef = reservation.sessionRef;
    const historyRef = payment?.id ? db.collection("payment_history").doc(payment.id) : null;
    const contract = {
      planCode: item.code,
      catalogItemId: item.id,
      planName: item.title || item.name,
      contractedPlanPrice: Number(item.price),
      contractedAt: Timestamp.fromDate(contractedAt),
      billingCycle: item.billingCycle || (itemKind === "service" ? "avulso" : "mensal"),
      itemType: item.type || "plan",
      itemKind,
      permissions: item.permissions,
      asaasCustomerId: customerId,
      asaasSubscriptionId: subscription?.id || "",
      asaasPaymentId: payment?.id || "",
      paymentStatus: "Pendente",
      planActive: false,
      status: "Pendente",
      updatedAt: FieldValue.serverTimestamp()
    };
    const batch = db.batch();
    if (itemKind === "subscription") {
      batch.set(companyRef, {
        ...contract,
        recurringPermissions: item.permissions,
        billingCheckoutLockedAt: FieldValue.delete(),
        billingCheckoutCatalogItemId: FieldValue.delete(),
        billingCheckoutPlanCode: FieldValue.delete(),
        billingCheckoutError: FieldValue.delete()
      }, { merge: true });
    } else {
      batch.set(companyRef, {
        asaasCustomerId: customerId,
        billingCheckoutLockedAt: FieldValue.delete(),
        billingCheckoutCatalogItemId: FieldValue.delete(),
        billingCheckoutPlanCode: FieldValue.delete(),
        billingCheckoutError: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
    batch.set(sessionRef, {
      companyUid: auth.uid,
      companyName: company.empresa || "Empresa",
      contactEmail: company.email || auth.email || "",
      ...contract,
      serviceContext,
      provider: "asaas",
      gatewaySessionId: payment?.id || subscription?.id || "",
      status: "Aguardando pagamento",
      sessionUrl: checkoutUrlFrom(payment),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    if (historyRef) {
      batch.set(historyRef, {
        catalogItemId: item.id,
        companyUid: auth.uid,
        planCode: item.code,
        planName: item.title || item.name,
        contractedPlanPrice: Number(item.price),
        amount: Number(payment.value ?? item.price),
        paidAmount: 0,
        billingCycle: item.billingCycle || (itemKind === "service" ? "avulso" : "mensal"),
        itemType: item.type || "plan",
        itemKind,
        permissions: item.permissions,
        serviceContext,
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
      itemKind,
      itemType: item.type || "plan",
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
    if (status === 401 || status === 403) {
      authDebug(req, status === 401 ? "returning_401" : "returning_403", {
        reason: error.message || "AUTH_UNKNOWN",
        status
      });
    }
    const publicMessages = {
      AUTH_REQUIRED: "Faça login novamente.",
      COMPANY_NOT_FOUND: "Cadastro da empresa não encontrado.",
      COMPANY_DOCUMENT_REQUIRED: "Informe um CPF ou CNPJ válido no cadastro da empresa.",
      PLAN_NOT_FOUND: "Plano não encontrado.",
      PLAN_UNAVAILABLE: "Plano indisponível.",
      PLAN_PRICE_INVALID: "Preço do plano inválido.",
      CATALOG_ITEM_ID_REQUIRED: "Informe o plano ou serviço.",
      CATALOG_ITEM_NOT_FOUND: "Plano ou serviço não encontrado.",
      CATALOG_ITEM_UNAVAILABLE: "Plano ou serviço indisponível.",
      CATALOG_ITEM_PRICE_INVALID: "Preço do plano ou serviço inválido.",
      CATALOG_ITEM_CYCLE_INVALID: "Periodicidade do plano ou serviço inválida.",
      CATALOG_ITEM_NAME_REQUIRED: "Nome do plano ou serviço inválido.",
      "401_TOKEN_MISSING": "401_TOKEN_MISSING",
      "401_TOKEN_INVALID": "401_TOKEN_INVALID",
      "403_COMPANY_NOT_FOUND": "403_COMPANY_NOT_FOUND",
      "403_COMPANY_NOT_ALLOWED": "403_COMPANY_NOT_ALLOWED",
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
    const historyRef = db.collection("payment_history").doc(payment.id);
    const existingHistory = await historyRef.get();
    const history = existingHistory.exists ? existingHistory.data() : {};
    const itemKind = history.itemKind || (payment.subscription ? "subscription" : "service");
    const permissions = normalizePermissions(history.permissions);
    const latestDueDate = `${payment.dueDate || ""}` >= `${company.lastPaymentDueDate || ""}`
      ? `${payment.dueDate || company.lastPaymentDueDate || ""}`
      : `${company.lastPaymentDueDate || ""}`;
    const batch = db.batch();
    if (itemKind === "subscription") {
      batch.set(companyDoc.ref, {
        asaasCustomerId: payment.customer || company.asaasCustomerId || "",
        asaasSubscriptionId: payment.subscription || company.asaasSubscriptionId || "",
        asaasPaymentId: payment.id,
        paymentStatus: state.paymentStatus,
        planActive: state.planActive,
        status: state.accountStatus,
        recurringPermissions: state.planActive ? permissions : normalizePermissions(),
        permissions: state.planActive ? permissions : normalizePermissions(),
        lastPaymentEvent: event.event,
        lastPaymentStatus: payment.status || "",
        lastPaymentDueDate: latestDueDate,
        lastPaymentAt: state.paid && state.changesAccess
          ? FieldValue.serverTimestamp()
          : (company.lastPaymentAt || null),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    } else {
      batch.set(companyDoc.ref, {
        asaasCustomerId: payment.customer || company.asaasCustomerId || "",
        lastServicePaymentEvent: event.event,
        lastServicePaymentStatus: payment.status || "",
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      if (state.paid) {
        const serviceContext = history.serviceContext || {};
        const serviceRef = db.collection("service_requests").doc(payment.id);
        batch.set(serviceRef, {
          origin: serviceContext.candidateId ? "company_candidate_profile" : "company",
          companyUid: companyDoc.id,
          empresa: company.empresa || company.nome || "Empresa",
          contactEmail: company.email || company.authEmail || "",
          tipo: history.planName || "Serviço avulso",
          serviceCode: history.planCode || "",
          servicePrice: Number(history.contractedPlanPrice || amount),
          servicePermissions: permissions,
          candidateId: serviceContext.candidateId || "",
          candidateName: serviceContext.candidateName || "",
          candidateEmail: serviceContext.candidateEmail || "",
          mensagem: serviceContext.message || `Serviço avulso confirmado pelo Asaas: ${history.planName || payment.description || ""}`,
          status: "Pagamento confirmado",
          deliveryStatus: "Contratado",
          paymentStatus: state.paymentStatus,
          asaasPaymentId: payment.id,
          createdAt: history.createdAt || FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }
    }
    batch.set(historyRef, {
      companyUid: companyDoc.id,
      planCode: history.planCode || company.planCode || "",
      planName: history.planName || company.planName || "",
      contractedPlanPrice: Number(history.contractedPlanPrice || company.contractedPlanPrice || amount),
      amount,
      paidAmount,
      billingCycle: history.billingCycle || company.billingCycle || "",
      itemKind,
      itemType: history.itemType || (itemKind === "service" ? "service" : "plan"),
      permissions,
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
