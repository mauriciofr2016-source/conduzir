import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDoc,
  deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const KEYS = {
  candidates: "bt_candidates",
  jobs: "bt_jobs",
  feedbacks: "bt_feedbacks",
  systemUsers: "bt_system_users",
  serviceRequests: "bt_service_requests",
  interviews: "bt_interviews",
  internalNotes: "bt_internal_notes",
  candidateAuthUser: "bt_candidate_auth_user",
  candidateProfile: "bt_candidate_profile",
  candidateAccounts: "bt_candidate_accounts",
  companyAuthUser: "bt_company_auth_user",
  companyProfile: "bt_company_profile",
  companyAccounts: "bt_company_accounts",
  companies: "bt_companies",
  catalogItems: "bt_catalog_items",
  billingSettings: "bt_billing_settings",
  paymentSessions: "bt_payment_sessions",
  paymentHistory: "bt_payment_history",
  systemSession: "bt_system_session"
};

const COLLECTIONS = {
  candidates: "candidates",
  jobs: "jobs",
  feedbacks: "feedbacks",
  systemUsers: "system_users",
  serviceRequests: "service_requests",
  interviews: "interviews",
  internalNotes: "internal_notes",
  companies: "companies",
  catalogItems: "catalog_items",
  billingSettings: "billing_settings",
  paymentSessions: "payment_sessions",
  paymentHistory: "payment_history"
};

const MASTER_ADMIN = {
  login: "admin.master",
  email: "admin@conduzirtalentos.com",
  nome: "Administrador Mestre",
  perfil: "Administrador"
};
const PERMISSION_KEYS = [
  "curriculumAccess",
  "selfServiceHiring",
  "consultancy",
  "managedRecruitment",
  "nr1",
  "reports"
];
const DEFAULT_PERMISSIONS = Object.freeze({
  curriculumAccess: false,
  selfServiceHiring: false,
  consultancy: false,
  managedRecruitment: false,
  nr1: false,
  reports: false
});
const PERMISSION_LABELS = {
  curriculumAccess: "Banco de Currículos",
  selfServiceHiring: "Seleção por conta própria",
  consultancy: "Consultoria/acompanhamento",
  managedRecruitment: "Recrutamento gerenciado",
  nr1: "Diagnóstico NR1",
  reports: "Relatórios"
};

function isMasterAdminRecord(user) {
  if (!user) return false;
  return `${user.email || ""}`.trim().toLowerCase() === MASTER_ADMIN.email && `${user.perfil || ""}` === "Administrador";
}

const SYSTEM_AUTH_EMAIL_DOMAIN = "acesso.conduzirtalentos.local";

function normalizeSystemLogin(value) {
  const clean = `${value || ""}`
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.|\.$/g, "");
  return clean || "consultora";
}

function makeSystemAuthEmail(login, perfil = "Consultora") {
  const loginPart = normalizeSystemLogin(login);
  const rolePart = normalizeSystemLogin(perfil || "consultora");
  return `${loginPart}.${rolePart}@${SYSTEM_AUTH_EMAIL_DOMAIN}`;
}

function isGeneratedSystemAuthEmail(email) {
  return `${email || ""}`.trim().toLowerCase().endsWith(`@${SYSTEM_AUTH_EMAIL_DOMAIN}`);
}

function prepareSystemUserPayload(data = {}, currentUser = null) {
  const payload = { ...data };
  payload.login = normalizeSystemLogin(payload.login);
  payload.nome = `${payload.nome || ""}`.trim() || payload.login;
  payload.perfil = payload.perfil || "Consultora";
  if (payload.perfil === "Administrador") {
    payload.login = MASTER_ADMIN.login;
    payload.email = MASTER_ADMIN.email;
    payload.nome = payload.nome || MASTER_ADMIN.nome;
  } else {
    payload.email = `${currentUser?.email || payload.email || makeSystemAuthEmail(payload.login, payload.perfil)}`.trim().toLowerCase();
  }
  return payload;
}

const defaultJobs = [
  { titulo: "Analista de RH", area: "Recursos Humanos", modelo: "Presencial", status: "Aberta" }
];

const defaultCatalogItems = [
  {
    code: "candidato-destaque-essencial",
    type: "plan",
    audience: "candidate",
    title: "Destaque Essencial",
    shortDescription: "Avaliação profissional inicial para melhorar seu posicionamento.",
    description: "Inclui análise inicial do perfil, orientação de melhoria do currículo e encaminhamento para avaliação da consultora quando houver aderência.",
    price: 49.9,
    billingCycle: "avulso",
    gateway: "Asaas",
    active: true,
    permissions: { curriculumAccess: true, selfServiceHiring: true, consultancy: false, managedRecruitment: false, nr1: false, reports: false },
    featured: false,
    sortOrder: 1,
    createdAt: "Padrão do sistema"
  },
  {
    code: "candidato-destaque-profissional",
    type: "plan",
    audience: "candidate",
    title: "Destaque Profissional",
    shortDescription: "Avaliação profissional + DISC + parecer orientativo.",
    description: "Inclui avaliação profissional, teste DISC, leitura técnica da consultora e parecer orientativo para destacar o candidato no banco.",
    price: 89.9,
    billingCycle: "avulso",
    gateway: "Asaas",
    active: true,
    permissions: { curriculumAccess: true, selfServiceHiring: true, consultancy: true, managedRecruitment: false, nr1: false, reports: true },
    featured: true,
    sortOrder: 2,
    createdAt: "Padrão do sistema"
  },
  {
    code: "candidato-destaque-completo",
    type: "plan",
    audience: "candidate",
    title: "Destaque Completo",
    shortDescription: "Pacote completo para currículo, avaliação e preparação.",
    description: "Inclui revisão de currículo, DISC profissional, orientação de carreira, parecer técnico e preparação para entrevistas.",
    price: 149.9,
    billingCycle: "avulso",
    gateway: "Asaas",
    active: true,
    permissions: { curriculumAccess: true, selfServiceHiring: true, consultancy: true, managedRecruitment: true, nr1: true, reports: true },
    featured: false,
    sortOrder: 3,
    createdAt: "Padrão do sistema"
  },
  {
    code: "plano-essencial",
    type: "plan",
    title: "Plano Essencial",
    shortDescription: "Acesso inicial, gestão de vagas e acompanhamento comercial básico.",
    description: "Ideal para empresas que querem começar com divulgação de vagas, organização do acesso e acompanhamento comercial enxuto.",
    price: 197,
    billingCycle: "mensal",
    gateway: "Asaas",
    active: true,
    featured: false,
    sortOrder: 1,
    createdAt: "Padrão do sistema"
  },
  {
    code: "plano-profissional",
    type: "plan",
    title: "Plano Profissional",
    shortDescription: "Libera banco de currículos, relatórios e apoio consultivo estratégico.",
    description: "Plano principal para operação recorrente, com consulta ao banco de talentos, relatórios e fluxo preparado para assinatura automática.",
    price: 397,
    billingCycle: "mensal",
    gateway: "Asaas",
    active: true,
    featured: true,
    sortOrder: 2,
    createdAt: "Padrão do sistema"
  },
  {
    code: "plano-premium",
    type: "plan",
    title: "Plano Premium",
    shortDescription: "Banco completo, apoio consultivo prioritário e operação avançada.",
    description: "Voltado para empresas que precisam de maior profundidade operacional, prioridade e gestão mais próxima da consultoria.",
    price: 697,
    billingCycle: "mensal",
    gateway: "Asaas",
    active: true,
    featured: false,
    sortOrder: 3,
    createdAt: "Padrão do sistema"
  },
  {
    code: "servico-recrutamento",
    type: "service",
    audience: "company_service",
    title: "Recrutamento e seleção completo",
    shortDescription: "Condução completa do processo seletivo.",
    description: "Abertura de vaga, triagem, entrevistas e devolutiva consolidada para a empresa.",
    price: 1200,
    billingCycle: "avulso",
    gateway: "Faturamento manual",
    active: true,
    permissions: { curriculumAccess: false, selfServiceHiring: false, consultancy: false, managedRecruitment: true, nr1: false, reports: true },
    featured: true,
    sortOrder: 4,
    createdAt: "Padrão do sistema"
  },
  {
    code: "servico-engenharia-cargo",
    type: "service",
    audience: "company_service",
    title: "Engenharia de cargo",
    shortDescription: "Estruturação do cargo e responsabilidades.",
    description: "Mapeamento de responsabilidades, perfil ideal, competências e alinhamento com a operação.",
    price: 650,
    billingCycle: "avulso",
    gateway: "Faturamento manual",
    active: true,
    permissions: { curriculumAccess: false, selfServiceHiring: false, consultancy: true, managedRecruitment: false, nr1: false, reports: true },
    featured: false,
    sortOrder: 5,
    createdAt: "Padrão do sistema"
  },
  {
    code: "servico-nr1",
    type: "service",
    audience: "company_service",
    title: "Diagnóstico de risco psicossocial NR1",
    shortDescription: "Levantamento técnico e devolutiva consultiva.",
    description: "Avaliação estruturada com foco em risco psicossocial, evidências e orientação para tomada de decisão.",
    price: 890,
    billingCycle: "avulso",
    gateway: "Faturamento manual",
    active: true,
    permissions: { curriculumAccess: false, selfServiceHiring: false, consultancy: true, managedRecruitment: false, nr1: true, reports: true },
    featured: false,
    sortOrder: 6,
    createdAt: "Padrão do sistema"
  }
];

const defaultBillingSettings = [{
  id: "default-billing-settings",
  provider: "asaas",
  checkoutMode: "hosted_api",
  publicBaseUrl: "",
  createCheckoutEndpoint: "/api/asaas/checkout",
  webhookEndpoint: "/api/asaas/webhook",
  successUrl: "",
  cancelUrl: "",
  supportEmail: "",
  supportNr1Whatsapp: "",
  supportNr1Message: "Olá, vim pela área da empresa e gostaria de falar sobre suporte/NR1.",
  interviewMeetLink: "",
  interviewMeetMessage: "Entrevista via Google Meet: clique no link e entre no horário combinado.",
  defaultCurrency: "brl",
  trialDays: 0,
  active: true,
  notes: "Base pronta para cobrança recorrente profissional com backend seguro.",
  createdAt: "Padrão do sistema"
}];


const state = {
  mode: "local",
  firestore: null,
  auth: null,
  currentCandidateUser: null,
  currentCandidateProfile: null,
  currentCompanyUser: null,
  currentCompanyProfile: null,
  currentSystemUser: null,
  systemUsers: [],
  candidates: [],
  jobs: [],
  feedbacks: [],
  serviceRequests: [],
  interviews: [],
  internalNotes: [],
  companies: [],
  catalogItems: [],
  billingSettings: [],
  paymentSessions: [],
  adminUserEditId: null,
  adminUserSearchTerm: "",
  adminManagementSearchTerm: "",
  adminManagementScope: "consultoras",
  companyCandidateFilters: { search: "", area: "", region: "" }
};

function hasFirebaseConfig() {
  const config = window.BT_FIREBASE_CONFIG;
  if (!config) return false;
  return Object.values(config).every((value) => typeof value === "string" && value.trim() && !value.includes("COLE_AQUI"));
}

function showGlobalNotice(message) {
  const host = document.getElementById("globalNoticeHost");
  if (!host) return;
  host.innerHTML = `<div class="notice">${message}</div>`;
}

function createNotice(text, parent) {
  if (!parent) return;
  const notice = document.createElement("div");
  notice.className = "notice";
  notice.textContent = text;
  parent.prepend(notice);
  setTimeout(() => notice.remove(), 3500);
}

const localStore = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const value = JSON.parse(raw);
      return value ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  remove(key) {
    localStorage.removeItem(key);
  }
};

function normalizeDocs(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

function formatCreatedAt(value) {
  try {
    if (!value) return "Agora há pouco";
    if (typeof value?.toDate === "function") return value.toDate().toLocaleString("pt-BR");
    if (value?.seconds) return new Date(value.seconds * 1000).toLocaleString("pt-BR");
    if (typeof value === "string") return value;
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return "Agora há pouco";
  }
}

function escapeHtml(value) {
  return `${value ?? ""}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeEmail(value) {
  return `${value || ""}`.trim().toLowerCase();
}

function normalizeStatusValue(value, fallback = "Ativo") {
  const normalized = `${value || fallback}`.trim().toLowerCase();
  if (["bloqueado", "blocked"].includes(normalized)) return "Bloqueado";
  if (["excluido", "excluído", "deleted"].includes(normalized)) return "Excluído";
  if (["pendente", "pending"].includes(normalized)) return "Pendente";
  if (["em análise", "em analise", "analise", "analysis"].includes(normalized)) return "Em análise";
  if (["inadimplente"].includes(normalized)) return "Inadimplente";
  if (["vencido"].includes(normalized)) return "Vencido";
  return "Ativo";
}

function accountIsRestricted(status) {
  const normalized = normalizeStatusValue(status).toLowerCase();
  return ["bloqueado", "excluído", "inadimplente", "vencido"].includes(normalized);
}


function formatCurrencyBRL(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function slugifyCatalogValue(value) {
  return `${value || ""}`
    .normalize("NFD")
    .replace(/[Ì€-Í¯]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `item-${Date.now()}`;
}

function normalizePriceInput(value) {
  if (typeof value === "number") return value;
  const sanitized = `${value || "0"}`
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.\-]/g, "");
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCatalogItemsByType(type) {
  const source = Array.isArray(state.catalogItems) && state.catalogItems.length
    ? state.catalogItems
    : (state.mode === "local" ? defaultCatalogItems : []);
  return source
    .filter((item) => `${item.type || ""}` === type && item.active !== false)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || `${a.title || ""}`.localeCompare(`${b.title || ""}`, "pt-BR"));
}


function getCatalogAudience(item) {
  if (item?.audience) return item.audience;
  if (`${item?.type || ""}` === "plan") return "company";
  if (`${item?.type || ""}` === "service") return "candidate_service";
  return "company";
}

function normalizePermissions(value = {}) {
  return PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = value?.[key] === true;
    return acc;
  }, {});
}

function getCatalogPermissions(item = {}) {
  return normalizePermissions(item.permissions);
}

function getCatalogItemKind(item = {}) {
  return `${item.type || ""}` === "service" || `${item.billingCycle || ""}`.toLowerCase() === "avulso" ? "service" : "subscription";
}

function permissionSummary(permissions = {}) {
  const normalized = normalizePermissions(permissions);
  const labels = PERMISSION_KEYS.filter((key) => normalized[key]).map((key) => PERMISSION_LABELS[key] || key);
  return labels.length ? labels.join(", ") : "Sem permissões automáticas";
}

function companyHasPermission(key) {
  const profile = state.currentCompanyProfile || {};
  const recurring = normalizePermissions(profile.recurringPermissions || profile.permissions || {});
  return profile.planActive === true && recurring[key] === true;
}

function getCatalogItemsByAudience(type, audience) {
  return getCatalogItemsByType(type).filter((item) => getCatalogAudience(item) === audience);
}

function getCatalogItemByCode(code) {
  const source = Array.isArray(state.catalogItems) && state.catalogItems.length
    ? state.catalogItems
    : (state.mode === "local" ? defaultCatalogItems : []);
  return source.find((item) => `${item.code || ""}` === `${code || ""}`) || null;
}

function getBillingCycleLabel(value) {
  const normalized = `${value || "mensal"}`.toLowerCase();
  if (normalized === "anual") return "ao ano";
  if (normalized === "trimestral") return "por trimestre";
  if (normalized === "semestral") return "por semestre";
  if (normalized === "avulso") return "pagamento avulso";
  return "por mês";
}

function getBillingProviderLabel(value) {
  const normalized = `${value || "asaas"}`.toLowerCase();
  if (normalized === "asaas") return "Asaas";
  return value ? `${value}` : "Asaas";
}
function getCheckoutModeLabel(value) {
  return `${value || "request_only"}` === "hosted_api" ? "Pagamento via endpoint seguro" : "Registrar interesse comercial";
}

function getActiveBillingSettings() {
  const source = Array.isArray(state.billingSettings) && state.billingSettings.length ? state.billingSettings : defaultBillingSettings;
  const active = source.find((item) => item.active !== false);
  return active || source[0] || defaultBillingSettings[0];
}

function resolveCheckoutEndpoint(endpoint, settings = getActiveBillingSettings()) {
  const value = `${endpoint || ""}`.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) {
    const publicBaseUrl = `${settings.publicBaseUrl || ""}`.trim().replace(/\/+$/, "");
    if (publicBaseUrl) return `${publicBaseUrl}${value}`;
    const projectId = `${window.BT_FIREBASE_CONFIG?.projectId || ""}`.trim();
    if (projectId && window.location.origin.includes("github.io")) return `https://${projectId}.web.app${value}`;
  }
  return value;
}

function maskTokenForLog(value) {
  const token = `${value || ""}`;
  if (!token) return "";
  if (token.length <= 16) return `${token.slice(0, 4)}...`;
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

async function getAuthenticatedCompanyIdToken() {
  if (state.mode !== "cloud" || !state.auth) {
    console.info("asaasCheckoutFrontendDebug", {
      step: "auth_not_ready",
      mode: state.mode,
      hasAuth: Boolean(state.auth)
    });
    throw new Error("AUTH_REQUIRED");
  }
  const authUser = await waitForAuthUser();
  if (!authUser?.uid || typeof authUser.getIdToken !== "function") {
    console.info("asaasCheckoutFrontendDebug", {
      step: "auth_user_missing",
      currentUserUid: state.auth?.currentUser?.uid || "",
      currentUserEmail: state.auth?.currentUser?.email || ""
    });
    throw new Error("AUTH_REQUIRED");
  }
  if (state.currentCompanyProfile?.uid && state.currentCompanyProfile.uid !== authUser.uid) {
    console.info("asaasCheckoutFrontendDebug", {
      step: "company_auth_mismatch",
      authUid: authUser.uid,
      profileUid: state.currentCompanyProfile.uid
    });
    throw new Error("COMPANY_AUTH_MISMATCH");
  }
  state.currentCompanyUser = authUser;
  const token = await authUser.getIdToken(true);
  console.info("asaasCheckoutFrontendDebug", {
    step: "token_obtained",
    authUid: authUser.uid,
    authEmail: authUser.email || "",
    tokenObtained: Boolean(token),
    tokenLength: token?.length || 0,
    tokenPreview: maskTokenForLog(token)
  });
  return token;
}

function waitForAuthUser(timeoutMs = 8000) {
  if (state.auth?.currentUser) return Promise.resolve(state.auth.currentUser);
  if (!state.auth) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = (user) => {
      if (settled) return;
      settled = true;
      try { unsubscribe(); } catch {}
      resolve(user || state.auth.currentUser || null);
    };
    const timer = setTimeout(() => finish(state.auth.currentUser || null), timeoutMs);
    unsubscribe = onAuthStateChanged(state.auth, (user) => {
      clearTimeout(timer);
      finish(user);
    }, () => {
      clearTimeout(timer);
      finish(null);
    });
  });
}


function getContractedPlanPrice(profile = {}) {
  const raw = profile.contractedPlanPrice ?? profile.planPrice ?? profile.planPriceContracted;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function makeContractedPlanSnapshot(plan = {}) {
  const price = Number(plan.price || 0);
  return {
    planCode: plan.code || slugifyCatalogValue(plan.title),
    planName: plan.title || "Plano empresarial",
    contractedPlanPrice: Number.isFinite(price) ? price : 0,
    billingCycle: plan.billingCycle || "mensal"
  };
}

function normalizeWhatsappNumber(value) {
  let digits = `${value || ""}`.replace(/\D/g, "");
  if (!digits) return "";
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) digits = `55${digits}`;
  if (digits.length < 12 || digits.length > 13) return "";
  return digits;
}

function createNr1WhatsappUrl(settings = getActiveBillingSettings()) {
  const number = normalizeWhatsappNumber(settings.supportNr1Whatsapp);
  if (!number) return "";
  const message = `${settings.supportNr1Message || "Olá, vim pela área da empresa e gostaria de falar sobre suporte/NR1."}`.trim();
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

function updateNr1FloatingWhatsappButton() {
  const button = document.getElementById("nr1FloatingWhatsapp");
  if (!button) return;
  const settings = getActiveBillingSettings();
  const url = createNr1WhatsappUrl(settings);
  if (url) {
    button.href = url;
    button.classList.remove("nr1-floating-whatsapp-disabled");
    button.removeAttribute("aria-disabled");
    button.title = "Falar no WhatsApp sobre suporte/NR1";
  } else {
    button.href = "#";
    button.classList.add("nr1-floating-whatsapp-disabled");
    button.setAttribute("aria-disabled", "true");
    button.title = "Configure o WhatsApp suporte/NR1 no painel admin";
  }
}

function initNr1FloatingWhatsappButton() {
  const button = document.getElementById("nr1FloatingWhatsapp");
  if (!button || button.dataset.nr1Bound === "true") return;
  button.dataset.nr1Bound = "true";
  button.addEventListener("click", (event) => {
    if (button.classList.contains("nr1-floating-whatsapp-disabled")) {
      event.preventDefault();
      createNotice("WhatsApp suporte/NR1 ainda não foi configurado pelo administrador.", document.getElementById("globalNoticeHost") || document.body);
    }
  });
  updateNr1FloatingWhatsappButton();
}

function getPublicCheckoutLabel() {
  return "Contratar Plano";
}


function getAdminCandidateDisplayName(item) {
  return item?.nome || item?.email || "Sem nome";
}

function getAdminCompanyDisplayName(item) {
  return item?.empresa || item?.nome || item?.email || "Sem empresa";
}

function getLocalAccounts(key) {
  return localStore.get(key, []);
}

function saveLocalAccounts(key, accounts) {
  localStore.set(key, Array.isArray(accounts) ? accounts : []);
}

function upsertLocalAccount(key, account, uniqueField = "email") {
  const items = getLocalAccounts(key);
  const normalizedUnique = `${account?.[uniqueField] || ""}`.trim().toLowerCase();
  const next = items.filter((item) => `${item?.uid || ""}` !== `${account?.uid || ""}` && `${item?.[uniqueField] || ""}`.trim().toLowerCase() !== normalizedUnique);
  next.unshift(account);
  saveLocalAccounts(key, next);
  return account;
}

function findLocalAccountByEmail(key, email) {
  const normalizedEmail = normalizeEmail(email);
  return getLocalAccounts(key).find((item) => normalizeEmail(item.email) === normalizedEmail) || null;
}

function getLocalProfileMap(storageKey) {
  return localStore.get(storageKey, {});
}

function saveLocalProfileMap(storageKey, map) {
  localStore.set(storageKey, map || {});
}

function getLocalProfileByUid(storageKey, uid) {
  const map = getLocalProfileMap(storageKey);
  return uid ? (map[uid] || null) : null;
}

function setLocalProfileByUid(storageKey, uid, profile) {
  if (!uid) return profile;
  const map = getLocalProfileMap(storageKey);
  map[uid] = profile;
  saveLocalProfileMap(storageKey, map);
  return profile;
}

function setSessionUser(key, user) {
  if (user) localStore.set(key, user);
  else localStore.remove(key);
}

function clearFormFields(form) {
  if (!form) return;
  form.reset();
}

function setButtonBusy(button, busyLabel, idleLabel, isBusy) {
  if (!button) return;
  if (typeof idleLabel !== "undefined" && !button.dataset.idleLabel) button.dataset.idleLabel = idleLabel;
  if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent;
  button.disabled = isBusy;
  button.textContent = isBusy ? busyLabel : (button.dataset.idleLabel || idleLabel || button.textContent);
}
function clearLegacySensitiveLocalData() {
  [KEYS.candidateAccounts, KEYS.companyAccounts].forEach((key) => localStore.remove(key));
  const systemUsers = localStore.get(KEYS.systemUsers, []);
  if (Array.isArray(systemUsers) && systemUsers.length) {
    const sanitized = systemUsers.map((item) => {
      if (!item || typeof item !== "object") return item;
      const next = { ...item };
      if ("senha" in next) next.senha = "";
      return next;
    });
    localStore.set(KEYS.systemUsers, sanitized);
  }
}
function isCandidatePage() {
  return document.body?.dataset?.page === "candidato";
}
function isCompanyPage() { return document.body?.dataset?.page === "empresa"; }
function isAdminPage() { return document.body?.dataset?.page === "admin"; }
function isConsultantPage() { return document.body?.dataset?.page === "consultora"; }
function isSystemPage(role) { return (role === "Administrador" && isAdminPage()) || (role === "Consultora" && isConsultantPage()); }


function clearCandidatePageState() {
  const registerForm = document.getElementById("candidateRegisterForm");
  const loginForm = document.getElementById("candidateLoginForm");
  const profileForm = document.getElementById("candidateForm");
  const serviceForm = document.getElementById("candidateServiceForm");
  clearFormFields(registerForm);
  clearFormFields(loginForm);
  clearFormFields(profileForm);
  clearFormFields(serviceForm);
  const curriculoNome = document.getElementById("curriculoNome");
  if (curriculoNome) curriculoNome.textContent = "Nenhum currículo informado.";
  const loggedText = document.getElementById("candidateLoggedUser");
  if (loggedText) loggedText.textContent = "Nenhum candidato logado";
}

function clearCompanyPageState() {
  const registerForm = document.getElementById("companyRegisterForm");
  const loginForm = document.getElementById("companyLoginForm");
  const requestForm = document.getElementById("companyRequestForm");
  clearFormFields(registerForm);
  clearFormFields(loginForm);
  clearFormFields(requestForm);
  const loggedText = document.getElementById("companyLoggedUser");
  if (loggedText) loggedText.textContent = "Nenhuma empresa logada";
  const plan = document.getElementById("companyCurrentPlan");
  if (plan) plan.textContent = "Nenhum";
  const payment = document.getElementById("companyPaymentStatus");
  if (payment) payment.textContent = "Pendente";
  const access = document.getElementById("companyAccessStatus");
  if (access) access.textContent = "Bloqueado";
  const badge = document.getElementById("companyPlanBadge");
  if (badge) badge.textContent = "Sem plano ativo";
}

function getCurrentCandidateEmail() {
  return `${state.currentCandidateUser?.email || state.currentCandidateProfile?.email || ""}`.trim().toLowerCase();
}

function getCurrentCandidateUid() {
  return `${state.currentCandidateUser?.uid || state.currentCandidateProfile?.uid || ""}`.trim();
}

function isRecordOwnedByCurrentCandidate(item) {
  const currentUid = getCurrentCandidateUid();
  const currentEmail = getCurrentCandidateEmail();
  if (!item) return false;
  const itemUid = `${item.uid || ""}`.trim();
  const itemEmail = `${item.email || item.candidateEmail || ""}`.trim().toLowerCase();
  return Boolean((currentUid && itemUid && itemUid === currentUid) || (currentEmail && itemEmail && itemEmail === currentEmail));
}

function getCandidateScopedCandidates(items) {
  if (!isCandidatePage()) return items;
  if (!state.currentCandidateUser && !state.currentCandidateProfile) return [];
  return (Array.isArray(items) ? items : []).filter(isRecordOwnedByCurrentCandidate);
}

function getCandidateScopedServiceRequests(items) {
  const currentUid = getCurrentCandidateUid();
  const currentEmail = getCurrentCandidateEmail();
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (item.origin !== "candidate") return false;
    const itemUid = `${item.uid || ""}`.trim();
    const itemEmail = `${item.email || ""}`.trim().toLowerCase();
    return Boolean((currentUid && itemUid === currentUid) || (currentEmail && itemEmail === currentEmail));
  });
}

function getCandidateScopedInterviews(items) {
  return (Array.isArray(items) ? items : []).filter(isRecordOwnedByCurrentCandidate);
}

function findCandidateForInterviewData(data = {}) {
  const email = `${data.candidateEmail || data.email || ""}`.trim().toLowerCase();
  const uid = `${data.uid || data.candidateUid || ""}`.trim();
  const name = `${data.candidato || data.nome || ""}`.trim().toLowerCase();
  return (state.candidates || []).find((item) => {
    const itemUid = `${item.uid || item.id || ""}`.trim();
    const itemEmail = `${item.email || ""}`.trim().toLowerCase();
    const itemName = `${item.nome || ""}`.trim().toLowerCase();
    return Boolean((uid && itemUid && itemUid === uid) || (email && itemEmail && itemEmail === email) || (!email && name && itemName && itemName === name));
  }) || null;
}

function buildInterviewPayload(data = {}) {
  const candidate = findCandidateForInterviewData(data);
  const billing = getActiveBillingSettings();
  const uid = data.uid || data.candidateUid || candidate?.uid || candidate?.id || "";
  const email = data.candidateEmail || data.email || candidate?.email || "";
  return {
    ...data,
    uid,
    candidateUid: uid,
    email,
    candidateEmail: email,
    candidato: data.candidato || candidate?.nome || "",
    meetLink: billing.interviewMeetLink || data.meetLink || "",
    meetMessage: billing.interviewMeetMessage || data.meetMessage || "Entrevista via Google Meet: clique no link e entre no horário combinado.",
    origin: "consultora"
  };
}

function getCandidateScopedFeedbacks(items) {
  return (Array.isArray(items) ? items : []).filter(isRecordOwnedByCurrentCandidate);
}

function showCandidateAuthNotice(message, type = "success") {
  const host = document.getElementById("candidateAuthNoticeHost");
  if (!host) return;
  host.innerHTML = `<div class="inline-success ${type === "error" ? "is-error" : type === "info" ? "is-info" : ""}">${message}</div>`;
  setTimeout(() => {
    if (host.firstElementChild?.textContent === message) host.innerHTML = "";
  }, 5000);
}

async function loadCandidateProfileForCurrentUser() {
  if (!isCandidatePage()) return null;
  if (state.mode === "cloud" && state.firestore && state.currentCandidateUser?.uid) {
    try {
      const profileRef = doc(state.firestore, COLLECTIONS.candidates, state.currentCandidateUser.uid);
      const profileSnap = await getDoc(profileRef);
      state.currentCandidateProfile = profileSnap.exists() ? { id: profileSnap.id, ...profileSnap.data() } : null;
    } catch (error) {
      console.error("Erro ao carregar perfil do candidato:", error);
      state.currentCandidateProfile = null;
    }
  } else {
    state.currentCandidateProfile = getLocalProfileByUid(KEYS.candidateProfile, state.currentCandidateUser?.uid) || localStore.get(KEYS.candidateProfile, null);
  }
  syncCandidateUiState();
  return state.currentCandidateProfile;
}

function syncCandidateUiState() {
  if (!isCandidatePage()) return;
  const authShell = document.getElementById("candidateAuthShell");
  const dashboard = document.getElementById("candidateDashboard");
  const loggedText = document.getElementById("candidateLoggedUser");
  const user = state.currentCandidateUser || state.currentCandidateProfile;
  if (authShell) authShell.classList.toggle("is-hidden", Boolean(user));
  if (dashboard) dashboard.classList.toggle("is-hidden", !user);
  if (loggedText) {
    loggedText.textContent = user ? `${user.displayName || state.currentCandidateProfile?.nome || "Candidato"} • ${user.email || state.currentCandidateProfile?.email || "sem e-mail"}` : "Nenhum candidato logado";
  }
  if (isCandidatePage()) {
    renderCandidateViews(state.candidates);
    renderServiceRequests(state.serviceRequests);
    renderInterviews(state.interviews);
    renderFeedbacks(state.feedbacks);
  }
}

async function createCandidateAccount({ nome, email, senha }) {
  const normalizedEmail = normalizeEmail(email);
  if (!state.auth || state.mode !== "cloud") throw new Error("AUTH_REQUIRED");
  const credentials = await createUserWithEmailAndPassword(state.auth, normalizedEmail, senha);
  if (nome?.trim()) {
    try { await updateProfile(credentials.user, { displayName: nome.trim() }); } catch {}
  }
  state.currentCandidateUser = credentials.user;
  setSessionUser(KEYS.candidateAuthUser, { uid: credentials.user.uid, email: credentials.user.email, displayName: credentials.user.displayName || `${nome || "Candidato"}`.trim() });
  return credentials.user;
}

async function loginCandidateAccount({ email, senha }) {
  const normalizedEmail = normalizeEmail(email);
  if (!state.auth || state.mode !== "cloud") throw new Error("AUTH_REQUIRED");
  const credentials = await signInWithEmailAndPassword(state.auth, normalizedEmail, senha);
  const profileRef = doc(state.firestore, COLLECTIONS.candidates, credentials.user.uid);
  const profileSnap = await getDoc(profileRef);
  const profileData = profileSnap.exists() ? profileSnap.data() : null;
  if (accountIsRestricted(profileData?.status)) {
    try { await signOut(state.auth); } catch {}
    throw new Error("ACCOUNT_BLOCKED");
  }
  state.currentCandidateUser = credentials.user;
  setSessionUser(KEYS.candidateAuthUser, { uid: credentials.user.uid, email: credentials.user.email, displayName: credentials.user.displayName || "Candidato" });
  return credentials.user;
}

async function logoutCandidateAccount() {
  if (state.mode === "cloud" && state.auth) {
    try { await signOut(state.auth); } catch {}
  }
  setSessionUser(KEYS.candidateAuthUser, null);
  state.currentCandidateUser = null;
  state.currentCandidateProfile = null;
  clearCandidatePageState();
  syncCandidateUiState();
}

async function persistCandidateProfile(data) {
  const currentUser = state.currentCandidateUser;
  const payload = {
    ...data,
    uid: currentUser?.uid || getCurrentCandidateUid(),
    email: currentUser?.email || data.email || state.currentCandidateProfile?.email || "",
    authEmail: currentUser?.email || data.email || "",
    nome: data.nome || currentUser?.displayName || state.currentCandidateProfile?.nome || "",
    status: normalizeStatusValue(data.status || state.currentCandidateProfile?.status || "Ativo"),
    candidateStatus: data.candidateStatus || state.currentCandidateProfile?.candidateStatus || "Em análise",
    validated: data.validated ?? state.currentCandidateProfile?.validated ?? false
  };

  if (state.mode === "cloud" && state.firestore && payload.uid) {
    const profileRef = doc(state.firestore, COLLECTIONS.candidates, payload.uid);
    const existing = await getDoc(profileRef);
    await setDoc(profileRef, {
      ...payload,
      createdAt: existing.exists() ? (existing.data().createdAt || serverTimestamp()) : serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    state.currentCandidateProfile = { id: payload.uid, ...(existing.exists() ? existing.data() : {}), ...payload };
    return;
  }

  const existingLocalProfile = getLocalProfileByUid(KEYS.candidateProfile, payload.uid);
  const localProfile = {
    id: payload.uid || crypto.randomUUID(),
    ...payload,
    createdAt: existingLocalProfile?.createdAt || new Date().toLocaleString("pt-BR"),
    updatedAt: new Date().toLocaleString("pt-BR")
  };
  state.currentCandidateProfile = localProfile;
  setLocalProfileByUid(KEYS.candidateProfile, localProfile.id, localProfile);
  localStore.set(KEYS.candidateProfile + "_current", localProfile);
  const localCandidates = localStore.get(KEYS.candidates, []);
  const nextCandidates = [localProfile, ...localCandidates.filter((item) => `${item.id || item.uid || ""}` !== `${localProfile.id}`)];
  localStore.set(KEYS.candidates, nextCandidates);
}


function showCompanyAuthNotice(message, type = "success") {
  const host = document.getElementById("companyAuthNoticeHost");
  if (!host) return;
  host.innerHTML = `<div class="inline-success ${type === "error" ? "is-error" : type === "info" ? "is-info" : ""}">${message}</div>`;
  setTimeout(() => {
    if (host.firstElementChild?.textContent === message) host.innerHTML = "";
  }, 5000);
}
function getCurrentCompanyEmail() { return `${state.currentCompanyUser?.email || state.currentCompanyProfile?.email || ""}`.trim().toLowerCase(); }
function getCurrentCompanyUid() { return `${state.currentCompanyUser?.uid || state.currentCompanyProfile?.uid || ""}`.trim(); }
async function loadCompanyProfileForCurrentUser() {
  if (!isCompanyPage()) return null;
  if (state.mode === "cloud" && state.firestore && state.currentCompanyUser?.uid) {
    try {
      const profileRef = doc(state.firestore, COLLECTIONS.companies, state.currentCompanyUser.uid);
      const snap = await getDoc(profileRef);
      state.currentCompanyProfile = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (e) { state.currentCompanyProfile = null; }
  } else {
    state.currentCompanyProfile = getLocalProfileByUid(KEYS.companyProfile, state.currentCompanyUser?.uid) || localStore.get(KEYS.companyProfile, null);
  }
  syncCompanyUiState();
  return state.currentCompanyProfile;
}
function companyHasActivePlan() {
  const profile = state.currentCompanyProfile || {};
  return profile.planActive === true || profile.paymentStatus === "Ativo";
}
function companyHasCurriculumAccess() {
  return companyHasPermission("curriculumAccess");
}
function syncCompanyPlanUi() {
  const profile = state.currentCompanyProfile || {};
  const plan = profile.planName || "Nenhum";
  const payment = profile.paymentStatus || "Pendente";
  const access = companyHasCurriculumAccess() ? "Liberado" : "Bloqueado";
  const contractedPrice = getContractedPlanPrice(profile);
  document.getElementById("companyCurrentPlan") && (document.getElementById("companyCurrentPlan").textContent = plan);
  document.getElementById("companyPaymentStatus") && (document.getElementById("companyPaymentStatus").textContent = payment);
  document.getElementById("companyAccessStatus") && (document.getElementById("companyAccessStatus").textContent = access);
  document.getElementById("companyContractedPlanPrice") && (document.getElementById("companyContractedPlanPrice").textContent = contractedPrice ? formatCurrencyBRL(contractedPrice) : "Nenhum");
  document.getElementById("companyContractedPlanMeta") && (document.getElementById("companyContractedPlanMeta").textContent = profile.contractedAt ? `Contratado em ${formatCreatedAt(profile.contractedAt)} - ${getBillingCycleLabel(profile.billingCycle)}` : "Valor travado no momento da assinatura");
  document.getElementById("companyPlanBadge") && (document.getElementById("companyPlanBadge").textContent = companyHasActivePlan() ? `${plan} ativo` : "Sem plano ativo");
  const lock = document.getElementById("companyLockedNotice");
  if (lock) lock.classList.toggle("is-hidden", companyHasCurriculumAccess());
}
function syncCompanyUiState() {
  if (!isCompanyPage()) return;
  const authShell = document.getElementById("companyAuthShell");
  const dashboard = document.getElementById("companyDashboard");
  const logged = document.getElementById("companyLoggedUser");
  const user = state.currentCompanyUser || state.currentCompanyProfile;
  if (authShell) authShell.classList.toggle("is-hidden", Boolean(user));
  if (dashboard) dashboard.classList.toggle("is-hidden", !user);
  if (logged) logged.textContent = user ? `${state.currentCompanyProfile?.empresa || user.displayName || "Empresa"} • ${user.email || state.currentCompanyProfile?.email || ""}` : "Nenhuma empresa logada";
  syncCompanyPlanUi();
  renderCompanyCatalogSections();
  renderCandidateViews(state.candidates);
  renderJobs(state.jobs.length ? state.jobs : defaultJobs);
  renderServiceRequests(state.serviceRequests);
}
async function createCompanyAccount(data) {
  const normalizedEmail = normalizeEmail(data.email);
  if (!state.auth || state.mode !== "cloud") throw new Error("AUTH_REQUIRED");
  const credentials = await createUserWithEmailAndPassword(state.auth, normalizedEmail, data.senha);
  try { await updateProfile(credentials.user, { displayName: data.empresa.trim() }); } catch {}
  state.currentCompanyUser = credentials.user;
  setSessionUser(KEYS.companyAuthUser, { uid: credentials.user.uid, email: credentials.user.email, displayName: credentials.user.displayName || `${data.empresa || "Empresa"}`.trim(), login: `${data.login || ""}`.trim() });
  return credentials.user;
}
async function loginCompanyAccount(data) {
  const normalizedEmail = normalizeEmail(data.email);
  if (!state.auth || state.mode !== "cloud") throw new Error("AUTH_REQUIRED");
  const credentials = await signInWithEmailAndPassword(state.auth, normalizedEmail, data.senha);
  const profileRef = doc(state.firestore, COLLECTIONS.companies, credentials.user.uid);
  const profileSnap = await getDoc(profileRef);
  const profileData = profileSnap.exists() ? profileSnap.data() : null;
  if (accountIsRestricted(profileData?.status)) {
    try { await signOut(state.auth); } catch {}
    throw new Error("ACCOUNT_BLOCKED");
  }
  state.currentCompanyUser = credentials.user;
  setSessionUser(KEYS.companyAuthUser, { uid: credentials.user.uid, email: credentials.user.email, displayName: credentials.user.displayName || "Empresa" });
  return credentials.user;
}
async function logoutCompanyAccount() {
  if (state.mode === "cloud" && state.auth) {
    try { await signOut(state.auth); } catch {}
  }
  setSessionUser(KEYS.companyAuthUser, null);
  state.currentCompanyUser = null;
  state.currentCompanyProfile = null;
  clearCompanyPageState();
  syncCompanyUiState();
}
async function persistCompanyProfile(data, mergeOnly = false) {
  const currentUser = state.currentCompanyUser || {};
  const payload = { ...state.currentCompanyProfile, ...data, uid: currentUser.uid || getCurrentCompanyUid(), email: currentUser.email || data.email || state.currentCompanyProfile?.email || "", authEmail: currentUser.email || data.email || "", empresa: data.empresa || state.currentCompanyProfile?.empresa || currentUser.displayName || "Empresa", status: normalizeStatusValue(data.status || state.currentCompanyProfile?.status || "Pendente") };
  if (state.mode === "cloud" && state.firestore && payload.uid) {
    const ref = doc(state.firestore, COLLECTIONS.companies, payload.uid);
    const existing = await getDoc(ref);
    await setDoc(ref, { ...payload, createdAt: existing.exists() ? (existing.data().createdAt || serverTimestamp()) : serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    state.currentCompanyProfile = { id: payload.uid, ...(existing.exists() ? existing.data() : {}), ...payload };
    return;
  }
  const existingLocalProfile = getLocalProfileByUid(KEYS.companyProfile, payload.uid);
  const localProfile = {
    id: payload.uid || crypto.randomUUID(),
    ...payload,
    createdAt: existingLocalProfile?.createdAt || new Date().toLocaleString("pt-BR"),
    updatedAt: new Date().toLocaleString("pt-BR")
  };
  state.currentCompanyProfile = localProfile;
  setLocalProfileByUid(KEYS.companyProfile, localProfile.id, localProfile);
  localStore.set(KEYS.companyProfile + "_current", localProfile);
  const localCompanies = localStore.get(KEYS.companies, []);
  const nextCompanies = [localProfile, ...localCompanies.filter((item) => `${item.id || item.uid || ""}` !== `${localProfile.id}`)];
  localStore.set(KEYS.companies, nextCompanies);
}
function showSystemAuthNotice(role, message, type = "success") {
  const host = document.getElementById(`systemAuthNoticeHost-${role === "Administrador" ? "admin" : "consultora"}`);
  if (!host) return;
  host.innerHTML = `<div class="inline-success ${type === "error" ? "is-error" : type === "info" ? "is-info" : ""}">${message}</div>`;
}
function syncSystemUiState(role) {
  const suffix = role === "Administrador" ? "admin" : "consultora";
  const authShell = document.getElementById(`systemAuthShell-${suffix}`);
  const dashboard = document.getElementById(`systemDashboard-${suffix}`);
  const logged = document.getElementById(`systemLoggedUser-${suffix}`);
  const isRole = state.currentSystemUser && state.currentSystemUser.perfil === role;
  if (authShell) authShell.classList.toggle("is-hidden", Boolean(isRole));
  if (dashboard) dashboard.classList.toggle("is-hidden", !isRole);
  if (logged && isRole) logged.textContent = `${state.currentSystemUser.nome || state.currentSystemUser.login} • ${state.currentSystemUser.perfil}`;
}
function getSecondaryAuthInstance() {
  const config = window.BT_FIREBASE_CONFIG;
  const secondaryName = "bt-secondary-auth";
  const app = getApps().find((item) => item.name === secondaryName) || initializeApp(config, secondaryName);
  return getAuth(app);
}

async function findSystemUserByIdentifier(identifier, role = "") {
  const normalized = `${identifier || ""}`.trim().toLowerCase();
  if (!normalized) return null;
  let users = state.systemUsers;
  if (!users.length) users = await fetchCollection("systemUsers", []);
  return users.find((item) => {
    const sameRole = !role || `${item.perfil || ""}` === role;
    const sameIdentifier = `${item.login || ""}`.trim().toLowerCase() === normalized || `${item.email || ""}`.trim().toLowerCase() === normalized;
    return sameRole && sameIdentifier;
  }) || null;
}

async function createSystemAuthAccount(email, senha, displayName = "") {
  if (!state.auth || !hasFirebaseConfig()) throw new Error("AUTH_NOT_READY");
  const normalizedEmail = `${email || ""}`.trim().toLowerCase();
  const secondaryAuth = getSecondaryAuthInstance();
  try {
    const credentials = await createUserWithEmailAndPassword(secondaryAuth, normalizedEmail, `${senha || ""}`);
    if (displayName) {
      try { await updateProfile(credentials.user, { displayName }); } catch {}
    }
    await signOut(secondaryAuth);
    return credentials.user;
  } catch (error) {
    if (error?.code === "auth/email-already-in-use") {
      const credentials = await signInWithEmailAndPassword(state.auth, normalizedEmail, `${senha || ""}`);
      if (displayName) {
        try { await updateProfile(credentials.user, { displayName }); } catch {}
      }
      const existingUser = credentials.user;
      await signOut(state.auth);
      return existingUser;
    }
    throw error;
  }
}

async function loginSystemUser(role, data) {
  const identifier = `${data.login || ""}`.trim();
  const senha = `${data.senha || ""}`.trim();
  if (!identifier || !senha) throw new Error("SYSTEM_LOGIN_INVALID");
  if (!state.auth || state.mode !== "cloud") throw new Error("AUTH_REQUIRED");

  const found = await findSystemUserByIdentifier(identifier, role);
  if (!found || `${found.status || "Ativo"}` === "Bloqueado" || !found.email) throw new Error("SYSTEM_LOGIN_INVALID");
  if (role === "Administrador" && !isMasterAdminRecord(found)) throw new Error("SYSTEM_LOGIN_INVALID");
  const credentials = await signInWithEmailAndPassword(state.auth, `${found.email || ""}`.trim().toLowerCase(), senha);
  const mergedUser = {
    ...found,
    uid: credentials.user.uid,
    email: credentials.user.email || found.email || ""
  };
  state.currentSystemUser = mergedUser;
  localStore.set(KEYS.systemSession, mergedUser);
  syncSystemUiState(role);
  return mergedUser;
}
async function logoutSystemUser(role) {
  if (state.mode === "cloud" && state.auth) {
    try { await signOut(state.auth); } catch (error) { console.error("Erro ao encerrar sessão do sistema:", error); }
  }
  state.currentSystemUser = null;
  localStore.remove(KEYS.systemSession);
  syncSystemUiState(role);
}
async function maybeCreateFirstAdmin(payload) {
  const users = await fetchCollection("systemUsers", []);
  const existingMasterAdmin = users.find((item) => isMasterAdminRecord(item));
  if (existingMasterAdmin) throw new Error("ADMIN_ALREADY_EXISTS");
  if (!state.auth || state.mode !== "cloud") throw new Error("AUTH_REQUIRED");
  await saveSystemUser({
    nome: MASTER_ADMIN.nome,
    login: MASTER_ADMIN.login,
    email: MASTER_ADMIN.email,
    senha: `${payload?.senha || ""}`.trim(),
    contato: `${payload?.contato || ""}`.trim(),
    observacoes: "Administrador mestre único do sistema.",
    perfil: "Administrador",
    status: "Ativo"
  });
}

async function cleanupLegacyCloudSensitiveData() {
  if (!state.firestore) return;
  try {
    const snapshot = await getDocs(collection(state.firestore, COLLECTIONS.systemUsers));
    const tasks = snapshot.docs
      .filter((item) => Object.prototype.hasOwnProperty.call(item.data() || {}, "senha"))
      .map((item) => updateDoc(doc(state.firestore, COLLECTIONS.systemUsers, item.id), { senha: deleteField(), updatedAt: serverTimestamp() }));
    if (tasks.length) await Promise.all(tasks);
  } catch (error) {
    console.error("Não foi possível limpar senhas antigas da nuvem:", error);
  }
}


async function setupCloudMode() {
  try {
    const config = window.BT_FIREBASE_CONFIG;
    const app = getApps().length ? getApps()[0] : initializeApp(config);
    state.firestore = getFirestore(app);
    state.auth = getAuth(app);
    state.mode = "cloud";
    showGlobalNotice("Versão ativa: dados salvos na nuvem com Firebase.");
    await cleanupLegacyCloudSensitiveData();
    bindRealtimeCollections();
  } catch (error) {
    console.error("Erro ao iniciar Firebase:", error);
    state.mode = "local";
    showGlobalNotice("Firebase não iniciou. O site entrou em modo local para não quebrar a base.");
  }
}

function bindCollection(name, renderer, fallback) {
  onSnapshot(
    query(collection(state.firestore, COLLECTIONS[name]), orderBy("createdAt", "desc")),
    (snapshot) => {
      state[name] = normalizeDocs(snapshot);
      renderer(state[name]);
    },
    (error) => {
      console.error(`Erro ao ler ${name}:`, error);
      fallback();
    }
  );
}

function bindRealtimeCollections() {
  if (!state.firestore) return;
  bindCollection("candidates", renderCandidateViews, fallbackCandidateRender);
  bindCollection("jobs", (items) => renderJobs(items.length ? items : defaultJobs), fallbackJobRender);
  bindCollection("feedbacks", renderFeedbacks, fallbackFeedbackRender);
  bindCollection("systemUsers", renderSystemUsers, fallbackSystemUsersRender);
  bindCollection("serviceRequests", renderServiceRequests, fallbackServiceRequestRender);
  bindCollection("interviews", renderInterviews, fallbackInterviewRender);
  bindCollection("internalNotes", renderInternalNotes, fallbackInternalNotesRender);
  bindCollection("companies", (items) => { state.companies = items; renderAdminRegistrations(); }, () => { state.companies = localStore.get(KEYS.companies, []); renderAdminRegistrations(); });
  bindCollection("catalogItems", renderCatalogItems, fallbackCatalogItemsRender);
  bindCollection("billingSettings", renderBillingSettings, fallbackBillingSettingsRender);
  bindCollection("paymentSessions", renderPaymentSessions, fallbackPaymentSessionsRender);
}

function fallbackCatalogItemsRender() {
  state.catalogItems = state.mode === "local" ? localStore.get(KEYS.catalogItems, defaultCatalogItems) : [];
  renderCatalogItems(state.catalogItems);
}

function fallbackBillingSettingsRender() {
  state.billingSettings = localStore.get(KEYS.billingSettings, defaultBillingSettings);
  renderBillingSettings(state.billingSettings);
}

function fallbackPaymentSessionsRender() {
  state.paymentSessions = localStore.get(KEYS.paymentSessions, []);
  renderPaymentSessions(state.paymentSessions);
}

function setFormValueIfExists(form, selector, value) {
  const field = form?.querySelector(selector);
  if (field) field.value = value ?? "";
}

function fillAdminBillingSettingsForm(settings) {
  const form = document.getElementById("adminBillingSettingsForm");
  if (!form || !settings) return;
  setFormValueIfExists(form, '[name="provider"]', settings.provider || "asaas");
  setFormValueIfExists(form, '[name="checkoutMode"]', settings.checkoutMode || "request_only");
  setFormValueIfExists(form, '[name="publicBaseUrl"]', settings.publicBaseUrl || "");
  setFormValueIfExists(form, '[name="createCheckoutEndpoint"]', settings.createCheckoutEndpoint || "");
  setFormValueIfExists(form, '[name="webhookEndpoint"]', settings.webhookEndpoint || "");
  setFormValueIfExists(form, '[name="successUrl"]', settings.successUrl || "");
  setFormValueIfExists(form, '[name="cancelUrl"]', settings.cancelUrl || "");
  setFormValueIfExists(form, '[name="supportEmail"]', settings.supportEmail || "");
  setFormValueIfExists(form, '[name="supportNr1Whatsapp"]', settings.supportNr1Whatsapp || "");
  setFormValueIfExists(form, '[name="supportNr1Message"]', settings.supportNr1Message || "Olá, vim pela área da empresa e gostaria de falar sobre suporte/NR1.");
  setFormValueIfExists(form, '[name="interviewMeetLink"]', settings.interviewMeetLink || "");
  setFormValueIfExists(form, '[name="interviewMeetMessage"]', settings.interviewMeetMessage || "Entrevista via Google Meet: clique no link e entre no horário combinado.");
  setFormValueIfExists(form, '[name="defaultCurrency"]', settings.defaultCurrency || "brl");
  setFormValueIfExists(form, '[name="trialDays"]', Number(settings.trialDays || 0));
  setFormValueIfExists(form, '[name="active"]', settings.active === false ? "false" : "true");
  setFormValueIfExists(form, '[name="notes"]', settings.notes || "");
}

function fillAdminSupportMeetForms(settings) {
  if (!settings) return;
  const supportForm = document.getElementById("adminSupportSettingsForm");
  if (supportForm) {
    setFormValueIfExists(supportForm, '[name="supportEmail"]', settings.supportEmail || "");
    setFormValueIfExists(supportForm, '[name="supportNr1Whatsapp"]', settings.supportNr1Whatsapp || "");
    setFormValueIfExists(supportForm, '[name="supportNr1Message"]', settings.supportNr1Message || "Olá, vim pela área da empresa e gostaria de falar sobre suporte/NR1.");
  }
  const meetForm = document.getElementById("adminMeetSettingsForm");
  if (meetForm) {
    setFormValueIfExists(meetForm, '[name="interviewMeetLink"]', settings.interviewMeetLink || "");
    setFormValueIfExists(meetForm, '[name="interviewMeetMessage"]', settings.interviewMeetMessage || "Entrevista via Google Meet: clique no link e entre no horário combinado.");
  }
}


function renderCandidateHighlightPlans() {
  const host = document.getElementById("candidateHighlightPlanCards");
  if (!host) return;
  const plans = getCatalogItemsByAudience("plan", "candidate");
  host.innerHTML = plans.length ? plans.map((item) => `
    <article class="catalog-card ${item.featured ? "is-featured" : ""}">
      <div class="catalog-card-head">
        <div>
          <span class="record-type-badge">${item.featured ? "Mais indicado" : "Plano candidato"}</span>
          <h3>${escapeHtml(item.title || "Plano de destaque")}</h3>
        </div>
        <div class="catalog-price">${formatCurrencyBRL(item.price || 0)}<small>${escapeHtml(getBillingCycleLabel(item.billingCycle))}</small></div>
      </div>
      <p>${escapeHtml(item.shortDescription || item.description || "Plano para avaliação profissional do candidato.")}</p>
      ${item.description ? `<p class="muted-note top-gap">${escapeHtml(item.description)}</p>` : ""}
      <button class="btn btn-primary top-gap" type="button" data-candidate-highlight-plan="${escapeHtml(item.code || item.title || "")}" data-plan-title="${escapeHtml(item.title || "")}" data-plan-price="${escapeHtml(item.price || 0)}">Solicitar este plano</button>
    </article>
  `).join("") : '<article class="mini-card"><strong>Nenhum plano de candidato ativo</strong><p>O administrador ainda não publicou os planos do botão Quero me destacar.</p></article>';
}

function renderBillingSettings(items) {
  state.billingSettings = Array.isArray(items) && items.length ? items : defaultBillingSettings;
  if (state.mode === "local") localStore.set(KEYS.billingSettings, state.billingSettings);
  const activeBillingSettings = getActiveBillingSettings();
  fillAdminBillingSettingsForm(activeBillingSettings);
  fillAdminSupportMeetForms(activeBillingSettings);
  renderAdminPlanServiceCatalog();
  renderCompanyCatalogSections();
  renderCandidateHighlightPlans();
  updateNr1FloatingWhatsappButton();
}

function renderPaymentSessions(items) {
  state.paymentSessions = Array.isArray(items) ? items : [];
  if (state.mode === "local") localStore.set(KEYS.paymentSessions, state.paymentSessions);
  const host = document.getElementById("adminPaymentSessionsList");
  if (host) {
    const sorted = [...state.paymentSessions].sort((a, b) => `${formatCreatedAt(b.createdAt)}`.localeCompare(`${formatCreatedAt(a.createdAt)}`, "pt-BR"));
    host.innerHTML = sorted.length ? sorted.slice(0, 12).map((item) => `
      <article class="mini-card">
        <strong>${escapeHtml(item.companyName || item.contactEmail || "Empresa")}</strong>
        <p><strong>Plano:</strong> ${escapeHtml(item.planName || "—")} • <strong>Gateway:</strong> ${escapeHtml(getBillingProviderLabel(item.provider || getActiveBillingSettings().provider))}</p>
        <p><strong>Status:</strong> ${escapeHtml(item.status || "Aguardando pagamento")} • <strong>Valor contratado:</strong> ${formatCurrencyBRL(item.contractedPlanPrice ?? item.planPrice ?? 0)}</p>
        <p class="muted-note">Criado em ${escapeHtml(formatCreatedAt(item.createdAt))}${item.asaasSubscriptionId ? ` • Assinatura Asaas: ${escapeHtml(item.asaasSubscriptionId)}` : ""}${item.sessionUrl ? ` • <a href="${escapeHtml(item.sessionUrl)}" target="_blank" rel="noopener">Abrir pagamento</a>` : ""}</p>
      </article>
    `).join("") : '<article class="mini-card"><strong>Nenhuma solicitação de pagamento</strong><p>Quando uma empresa clicar para contratar um plano, a intenção financeira aparecerá aqui.</p></article>';
  }
  const sessionNotice = document.getElementById("companyPaymentSessionNotice");
  if (sessionNotice && isCompanyPage()) {
    const email = getCurrentCompanyEmail();
    const uid = getCurrentCompanyUid();
    const recent = state.paymentSessions.find((item) => `${item.companyUid || ""}` === uid || normalizeEmail(item.contactEmail) === email);
    sessionNotice.textContent = recent ? `Última solicitação: ${recent.planName || "Plano"} • ${recent.status || "Aguardando pagamento"} • ${formatCreatedAt(recent.createdAt)}` : "Nenhuma solicitação de pagamento registrada para este login ainda.";
  }
}


function renderAdminPlanServiceCatalog() {
  const companyPlansHost = document.getElementById("adminCatalogPlansList");
  const candidatePlansHost = document.getElementById("adminCatalogCandidatePlansList");
  const servicesHost = document.getElementById("adminCatalogServicesList");
  const billingStatsHost = document.getElementById("adminBillingArchitectureStatus");
  if (!companyPlansHost && !candidatePlansHost && !servicesHost && !billingStatsHost) return;

  const source = Array.isArray(state.catalogItems) && state.catalogItems.length
    ? state.catalogItems
    : (state.mode === "local" ? defaultCatalogItems : []);
  const ordered = [...source].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const companyPlans = ordered.filter((item) => item.type === "plan" && getCatalogAudience(item) === "company");
  const candidatePlans = ordered.filter((item) => item.type === "plan" && getCatalogAudience(item) === "candidate");
  const services = ordered.filter((item) => item.type === "service");

  const audienceLabel = (item) => {
    const audience = getCatalogAudience(item);
    if (audience === "candidate") return "Plano candidato";
    if (audience === "company_service") return "Serviço avulso empresa";
    if (audience === "candidate_service") return "Serviço no currículo";
    return "Plano empresa";
  };

  const makeCard = (item) => `
    <article class="catalog-card ${item.active === false ? "is-inactive" : ""}">
      <div class="catalog-card-head">
        <div>
          <span class="record-type-badge">${escapeHtml(audienceLabel(item))}</span>
          <h3>${escapeHtml(item.title || "Sem título")}</h3>
        </div>
        <div class="catalog-price">${formatCurrencyBRL(item.price || 0)}<small>${escapeHtml(getBillingCycleLabel(item.billingCycle))}</small></div>
      </div>
      <p>${escapeHtml(item.shortDescription || item.description || "Sem descrição.")}</p>
      <div class="record-meta-grid top-gap">
        <span><strong>Código:</strong> ${escapeHtml(item.code || "-")}</span>
        <span><strong>Gateway:</strong> ${escapeHtml(item.gateway || "Não definido")}</span>
        <span><strong>Ordem:</strong> ${escapeHtml(item.sortOrder || 0)}</span>
        <span><strong>Status:</strong> ${item.active === false ? "Inativo" : "Ativo"}</span>
        <span><strong>Permissões:</strong> ${escapeHtml(permissionSummary(item.permissions))}</span>
      </div>
      ${item.description ? `<p class="muted-note top-gap">${escapeHtml(item.description)}</p>` : ""}
      <div class="form-actions top-gap">
        <button type="button" class="btn btn-secondary" data-catalog-action="edit" data-catalog-id="${item.id || item.code}">Editar</button>
        <button type="button" class="btn btn-secondary" data-catalog-action="toggle" data-catalog-id="${item.id || item.code}">${item.active === false ? "Ativar" : "Inativar"}</button>
        <button type="button" class="btn btn-secondary" data-catalog-action="delete" data-catalog-id="${item.id || item.code}">Excluir</button>
      </div>
    </article>
  `;

  if (companyPlansHost) companyPlansHost.innerHTML = companyPlans.length ? companyPlans.map(makeCard).join("") : '<article class="mini-card"><strong>Nenhum plano empresarial</strong><p>Cadastre planos mensais para empresas.</p></article>';
  if (candidatePlansHost) candidatePlansHost.innerHTML = candidatePlans.length ? candidatePlans.map(makeCard).join("") : '<article class="mini-card"><strong>Nenhum plano de candidato</strong><p>Cadastre até três opções para o botão Quero me destacar.</p></article>';
  if (servicesHost) servicesHost.innerHTML = services.length ? services.map(makeCard).join("") : '<article class="mini-card"><strong>Nenhum serviço vinculado</strong><p>Cadastre serviços que aparecerão dentro do currículo do candidato para a empresa contratar.</p></article>';

  if (billingStatsHost) {
    const activeCompanyPlans = companyPlans.filter((item) => item.active !== false).length;
    const activeCandidatePlans = candidatePlans.filter((item) => item.active !== false).length;
    const activeServices = services.filter((item) => item.active !== false).length;
    billingStatsHost.innerHTML = `
      <article class="mini-card"><strong>${activeCompanyPlans}</strong><p>Plano(s) empresa ativo(s)</p></article>
      <article class="mini-card"><strong>${activeCandidatePlans}</strong><p>Plano(s) candidato ativo(s)</p></article>
      <article class="mini-card"><strong>${activeServices}</strong><p>Serviço(s) no currículo</p></article>
    `;
  }
}


function renderCompanyCatalogSections() {
  const planHost = document.getElementById("companyPlanCards");
  const serviceSelect = document.getElementById("companyServiceType");
  const standaloneServiceHost = document.getElementById("companyStandaloneServiceCards");
  const architectureNote = document.getElementById("companyBillingArchitectureNote");
  const billingCards = document.getElementById("companyBillingSettingsCards");
  const plans = getCatalogItemsByAudience("plan", "company").filter((item) => item.code);
  const services = getCatalogItemsByAudience("service", "candidate_service");
  const standaloneServices = [
    ...getCatalogItemsByAudience("service", "company_service"),
    ...getCatalogItemsByAudience("service", "company")
  ].filter((item, index, source) => item.code && source.findIndex((other) => other.code === item.code) === index);
  const billing = getActiveBillingSettings();

  if (planHost) {
    planHost.innerHTML = plans.length ? plans.map((item) => `
      <article class="catalog-card ${item.featured ? "is-featured" : ""}">
        <div class="catalog-card-head">
          <div>
            <span class="record-type-badge">${item.featured ? "Mais indicado" : "Plano"}</span>
            <h3>${escapeHtml(item.title || "Plano")}</h3>
          </div>
          <div class="catalog-price">${formatCurrencyBRL(item.price || 0)}<small>${escapeHtml(getBillingCycleLabel(item.billingCycle))}</small></div>
        </div>
        <p>${escapeHtml(item.shortDescription || item.description || "Sem descrição.")}</p>
        <p class="muted-note top-gap"><strong>Gateway preparado:</strong> ${escapeHtml(item.gateway || getBillingProviderLabel(getActiveBillingSettings().provider))}</p>
        <button class="btn btn-primary top-gap" type="button" data-plan-contract="${escapeHtml(item.code || "")}">${escapeHtml(getPublicCheckoutLabel())}</button>
      </article>
    `).join("") : '<article class="mini-card"><strong>Nenhum plano ativo</strong><p>O administrador ainda não publicou planos nesta versão.</p></article>' ;
  }

  if (serviceSelect) {
    const companyActionOptions = [
      `<option value="Solicitar contato">Solicitar contato com candidato</option>`,
      `<option value="Solicitar entrevista">Solicitar entrevista com candidato</option>`,
      `<option value="Receber mais perfis">Receber mais perfis</option>`,
      `<option value="Ver parecer completo">Ver parecer completo</option>`,
      `<option value="Solicitar avaliação comportamental">Solicitar avaliação comportamental</option>`,
      `<option value="Solicitar Book completo">Solicitar Book completo</option>`,
      `<option value="Abrir processo seletivo">Abrir processo seletivo</option>`
    ].join("");
    const serviceOptions = services.length
      ? services.map((item) => `<option value="${escapeHtml(item.title || "")}" data-service-code="${escapeHtml(item.code || "")}">${escapeHtml(item.title || "Serviço")} — ${formatCurrencyBRL(item.price || 0)}</option>`).join("")
      : "";
    serviceSelect.innerHTML = companyActionOptions + serviceOptions;
  }

  if (standaloneServiceHost) {
    standaloneServiceHost.innerHTML = standaloneServices.length ? standaloneServices.map((item) => `
      <article class="catalog-card ${item.featured ? "is-featured" : ""}">
        <div class="catalog-card-head">
          <div>
            <span class="record-type-badge">${item.featured ? "Mais indicado" : "Servico avulso"}</span>
            <h3>${escapeHtml(item.title || "Servico")}</h3>
          </div>
          <div class="catalog-price">${formatCurrencyBRL(item.price || 0)}<small>pagamento unico</small></div>
        </div>
        <p>${escapeHtml(item.shortDescription || item.description || "Servico executado pela consultoria.")}</p>
        <p class="muted-note top-gap"><strong>Libera:</strong> ${escapeHtml(permissionSummary(item.permissions))}</p>
        <button class="btn btn-primary top-gap" type="button" data-service-contract="${escapeHtml(item.code || "")}">Contratar Serviço</button>
      </article>
    `).join("") : '<article class="mini-card"><strong>Nenhum servico avulso publicado</strong><p>O administrador ainda nao publicou servicos avulsos para empresas.</p></article>';
  }

  if (billingCards) {
    billingCards.innerHTML = `
      <article class="mini-card"><strong>${escapeHtml(getBillingProviderLabel(billing.provider))}</strong><p>Gateway principal configurado pelo admin.</p></article>
      <article class="mini-card"><strong>${escapeHtml(getCheckoutModeLabel(billing.checkoutMode))}</strong><p>${billing.trialDays ? `Teste gratis de ${escapeHtml(billing.trialDays)} dia(s).` : 'Sem periodo de teste configurado.'}</p></article>
    `;
  }

  if (architectureNote) {
    architectureNote.textContent = billing.checkoutMode === "hosted_api" && billing.createCheckoutEndpoint
      ? `Pagamento Asaas configurado via endpoint seguro. O valor do catalogo e usado somente para novas assinaturas e fica travado no contrato criado.`
      : `O clique registra a intencao comercial com ${getBillingProviderLabel(billing.provider)}. Alteracoes de preco afetam apenas novas assinaturas.`;
  }
  updateNr1FloatingWhatsappButton();
  renderPaymentSessions(state.paymentSessions || []);
}

function renderCatalogItems(items) {
  state.catalogItems = Array.isArray(items) && items.length
    ? items
    : (state.mode === "local" ? defaultCatalogItems : []);
  if (state.mode === "local") localStore.set(KEYS.catalogItems, state.catalogItems);
  renderAdminPlanServiceCatalog();
  renderCompanyCatalogSections();
}

function clearAdminCatalogForm() {
  const form = document.getElementById("adminCatalogForm");
  if (!form) return;
  form.reset();
  const idField = document.getElementById("adminCatalogId");
  if (idField) idField.value = "";
  const title = document.getElementById("adminCatalogFormTitle");
  if (title) title.textContent = "Cadastrar novo item";
  const submit = document.getElementById("adminCatalogSubmitBtn");
  if (submit) submit.textContent = "Salvar item";
}

function fillAdminCatalogForm(item) {
  const form = document.getElementById("adminCatalogForm");
  if (!form || !item) return;
  form.querySelector('[name="catalogId"]').value = item.id || item.code || "";
  form.querySelector('[name="type"]').value = item.type || "plan";
  const audienceField = form.querySelector('[name="audience"]');
  if (audienceField) audienceField.value = getCatalogAudience(item);
  form.querySelector('[name="title"]').value = item.title || "";
  form.querySelector('[name="code"]').value = item.code || "";
  form.querySelector('[name="price"]').value = Number(item.price || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  form.querySelector('[name="billingCycle"]').value = item.billingCycle || "mensal";
  form.querySelector('[name="gateway"]').value = item.gateway || "Asaas";
  form.querySelector('[name="sortOrder"]').value = item.sortOrder || 0;
  form.querySelector('[name="shortDescription"]').value = item.shortDescription || "";
  form.querySelector('[name="description"]').value = item.description || "";
  form.querySelector('[name="active"]').value = item.active === false ? "false" : "true";
  form.querySelector('[name="featured"]').value = item.featured ? "true" : "false";
  const permissions = getCatalogPermissions(item);
  PERMISSION_KEYS.forEach((key) => {
    const field = form.querySelector(`[name="permissions.${key}"]`);
    if (field) field.checked = permissions[key] === true;
  });
  const title = document.getElementById("adminCatalogFormTitle");
  if (title) title.textContent = `Editar: ${item.title || "item"}`;
  const submit = document.getElementById("adminCatalogSubmitBtn");
  if (submit) submit.textContent = "Salvar alteracoes";
}

function showAdminCatalogNotice(message, type = "success") {
  const host = document.getElementById("adminCatalogNoticeHost");
  if (!host) return;
  host.innerHTML = `<div class="inline-success ${type === "error" ? "is-error" : type === "info" ? "is-info" : ""}">${message}</div>`;
}

async function saveCatalogItemRecord(payload) {
  const normalizedType = payload.type === "service" ? "service" : "plan";
  const normalizedAudience = normalizedType === "plan"
    ? "company"
    : (payload.audience || "candidate_service");
  const data = {
    type: normalizedType,
    audience: normalizedAudience,
    title: `${payload.title || ""}`.trim(),
    code: slugifyCatalogValue(payload.code || payload.title),
    shortDescription: `${payload.shortDescription || ""}`.trim(),
    description: `${payload.description || ""}`.trim(),
    price: normalizePriceInput(payload.price),
    billingCycle: `${payload.billingCycle || (normalizedType === "service" ? "avulso" : "mensal")}`.trim().toLowerCase(),
    gateway: `${payload.gateway || "Asaas"}`.trim(),
    sortOrder: Number(payload.sortOrder || 0),
    active: normalizedType === "plan" && normalizedAudience === "company" ? true : `${payload.active}` !== "false",
    featured: `${payload.featured}` === "true",
    permissions: normalizePermissions(Object.fromEntries(
      PERMISSION_KEYS.map((key) => [key, payload[`permissions.${key}`] === "on"])
    ))
  };
  if (!data.code || !data.title || !Number.isFinite(data.price) || data.price <= 0 || !data.billingCycle) {
    throw new Error("CATALOG_PLAN_REQUIRED_FIELDS");
  }
  const currentId = `${payload.catalogId || ""}`.trim();
  const source = Array.isArray(state.catalogItems) ? state.catalogItems : [];
  const duplicate = source.find((item) => `${item.code || ""}` === data.code && `${item.id || item.code || ""}` !== currentId);
  if (duplicate) throw new Error("CATALOG_CODE_EXISTS");
  if (currentId) {
    const existing = source.find((item) => `${item.id || item.code || ""}` === currentId);
    if (existing?.id && (state.mode === "cloud" && state.firestore)) {
      await updateRecord("catalogItems", existing.id, data);
    } else if (state.mode === "cloud" && state.firestore) {
      await setDoc(doc(state.firestore, COLLECTIONS.catalogItems, data.code), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    } else {
      const next = source.map((item) => `${item.id || item.code || ""}` === currentId ? { ...item, ...data, id: item.id || item.code || currentId } : item);
      localStore.set(KEYS.catalogItems, next);
      state.catalogItems = next;
      renderCatalogItems(next);
    }
    return;
  }
  if (state.mode === "cloud" && state.firestore) {
    await setDoc(doc(state.firestore, COLLECTIONS.catalogItems, data.code), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    return;
  }
  await saveRecord("catalogItems", data);
}

async function toggleCatalogItemRecord(record) {
  const nextStatus = !(record.active !== false);
  if (record.type === "plan" && getCatalogAudience(record) === "company" && nextStatus === false) {
    throw new Error("COMPANY_PLAN_ACTIVE_REQUIRED");
  }
  if (record.id && state.mode === "cloud" && state.firestore) {
    await updateRecord("catalogItems", record.id, { active: nextStatus });
    return;
  }
  const next = (state.catalogItems || []).map((item) => `${item.id || item.code || ""}` === `${record.id || record.code || ""}` ? { ...item, active: nextStatus } : item);
  localStore.set(KEYS.catalogItems, next);
  renderCatalogItems(next);
}

async function deleteCatalogItemRecord(record) {
  if (record.id && state.mode === "cloud" && state.firestore) {
    await deleteRecord("catalogItems", record.id);
    return;
  }
  const next = (state.catalogItems || []).filter((item) => `${item.id || item.code || ""}` !== `${record.id || record.code || ""}`);
  localStore.set(KEYS.catalogItems, next);
  renderCatalogItems(next.length ? next : defaultCatalogItems);
}

function initAdminCatalogManagement() {
  const form = document.getElementById("adminCatalogForm");
  if (!form) return;
  document.getElementById("adminCatalogCancelBtn")?.addEventListener("click", () => {
    clearAdminCatalogForm();
    showAdminCatalogNotice("Formulário limpo. Você pode cadastrar um novo plano ou serviço.", "info");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    const submit = document.getElementById("adminCatalogSubmitBtn");
    try {
      setButtonBusy(submit, "Salvando...", submit?.textContent || "Salvar item", true);
      await saveCatalogItemRecord(payload);
      clearAdminCatalogForm();
      showAdminCatalogNotice("Item salvo com sucesso. As áreas de candidato, empresa e serviços no currículo foram atualizadas.");
      await hydrateInitialData();
    } catch (error) {
      console.error(error);
      let message = "Nao foi possivel salvar o item agora.";
      if (error.message === "CATALOG_CODE_EXISTS") {
        message = "Ja existe um plano ou servico com esse codigo. Ajuste o codigo e tente novamente.";
      } else if (error.message === "CATALOG_PLAN_REQUIRED_FIELDS") {
        message = "Informe codigo, titulo, valor e ciclo de cobranca validos para salvar o plano.";
      }
      showAdminCatalogNotice(message, "error");
    } finally {
      setButtonBusy(submit, "Salvando...", submit?.dataset?.idleLabel || "Salvar item", false);
    }
  });

  document.getElementById("tab-planos")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-catalog-action]");
    if (!button) return;
    const action = button.dataset.catalogAction;
    const recordId = button.dataset.catalogId;
    const record = (state.catalogItems || []).find((item) => `${item.id || item.code || ""}` === `${recordId || ""}`);
    if (!record) return showAdminCatalogNotice("Item não encontrado para esta ação.", "error");
    try {
      if (action === "edit") {
        fillAdminCatalogForm(record);
        showAdminCatalogNotice("Item carregado para edição.", "info");
      } else if (action === "toggle") {
        await toggleCatalogItemRecord(record);
        showAdminCatalogNotice(record.active === false ? "Item reativado com sucesso." : "Item inativado com sucesso.");
        await hydrateInitialData();
      } else if (action === "delete") {
        if (!window.confirm(`Deseja realmente excluir ${record.title || "este item"}?`)) return;
        await deleteCatalogItemRecord(record);
        showAdminCatalogNotice("Item excluído com sucesso.");
        await hydrateInitialData();
      }
    } catch (error) {
      console.error(error);
      showAdminCatalogNotice(error.message === "COMPANY_PLAN_ACTIVE_REQUIRED" ? "Planos empresariais usados no pagamento Asaas devem permanecer ativos em catalog_items." : "Nao foi possivel concluir essa acao agora.", "error");
    }
  });
}

async function saveBillingSettingsRecord(payload) {
  const data = {
    provider: `${payload.provider || "asaas"}`.trim().toLowerCase(),
    checkoutMode: `${payload.checkoutMode || "request_only"}`.trim(),
    publicBaseUrl: `${payload.publicBaseUrl || ""}`.trim(),
    createCheckoutEndpoint: `${payload.createCheckoutEndpoint || ""}`.trim(),
    webhookEndpoint: `${payload.webhookEndpoint || ""}`.trim(),
    successUrl: `${payload.successUrl || ""}`.trim(),
    cancelUrl: `${payload.cancelUrl || ""}`.trim(),
    supportEmail: normalizeEmail(payload.supportEmail || ""),
    supportNr1Whatsapp: `${payload.supportNr1Whatsapp || ""}`.trim(),
    supportNr1Message: `${payload.supportNr1Message || ""}`.trim() || "Olá, vim pela área da empresa e gostaria de falar sobre suporte/NR1.",
    interviewMeetLink: `${payload.interviewMeetLink || ""}`.trim(),
    interviewMeetMessage: `${payload.interviewMeetMessage || ""}`.trim() || "Entrevista via Google Meet: clique no link e entre no horário combinado.",
    homeAutoApproved: payload.homeAutoApproved === undefined ? true : (payload.homeAutoApproved === "true" || payload.homeAutoApproved === true || payload.homeAutoApproved === "on"),
    homeFeaturedCandidateIds: Array.isArray(payload.homeFeaturedCandidateIds) ? payload.homeFeaturedCandidateIds : (payload.homeFeaturedCandidateIds ? [payload.homeFeaturedCandidateIds] : []),
    defaultCurrency: `${payload.defaultCurrency || "brl"}`.trim().toLowerCase(),
    trialDays: Number(payload.trialDays || 0),
    active: `${payload.active}` !== "false",
    notes: `${payload.notes || ""}`.trim()
  };

  const current = (state.billingSettings || [])[0];
  const isOnlyDefaultSettings = !current?.id || current.id === "default-billing-settings";

  if (state.mode === "cloud" && state.firestore) {
    if (!isOnlyDefaultSettings) {
      await updateRecord("billingSettings", current.id, data);
      return;
    }

    // Quando ainda não existe documento real no Firebase, cria uma configuração fixa.
    // Antes o sistema tentava atualizar "default-billing-settings", que é só um padrão interno.
    await setDoc(doc(state.firestore, COLLECTIONS.billingSettings, "main"), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    return;
  }

  if (current?.id && current.id !== "default-billing-settings") {
    const next = [{ ...current, ...data, updatedAt: new Date().toLocaleString("pt-BR") }];
    state.billingSettings = next;
    localStore.set(KEYS.billingSettings, next);
    renderBillingSettings(next);
    return;
  }

  const next = [{ id: "main", ...data, createdAt: new Date().toLocaleString("pt-BR") }];
  state.billingSettings = next;
  localStore.set(KEYS.billingSettings, next);
  renderBillingSettings(next);
}

async function createPaymentSessionRecord(payload) {
  await saveRecord("paymentSessions", payload);
}

async function createPaymentHistoryRecord(payload) {
  await saveRecord("paymentHistory", {
    ...payload,
    amount: payload.contractedPlanPrice ?? payload.amount ?? payload.planPrice ?? 0,
    paidAmount: payload.paidAmount ?? 0
  });
}

async function startProfessionalCheckout(plan, options = {}) {
  const billing = getActiveBillingSettings();
  const company = state.currentCompanyProfile || {};
  const currentUser = state.currentCompanyUser || {};
  const contractedPlan = makeContractedPlanSnapshot(plan);
  const itemKind = getCatalogItemKind(plan);
  const contractedAt = new Date().toISOString();
  const sessionPayload = {
    companyUid: getCurrentCompanyUid(),
    companyName: company.empresa || currentUser.displayName || "Empresa",
    contactEmail: currentUser.email || company.email || "",
    planName: contractedPlan.planName,
    planCode: contractedPlan.planCode,
    planPrice: contractedPlan.contractedPlanPrice,
    contractedPlanPrice: contractedPlan.contractedPlanPrice,
    contractedAt,
    billingCycle: contractedPlan.billingCycle,
    itemType: plan.type || "plan",
    itemKind,
    permissions: getCatalogPermissions(plan),
    currency: billing.defaultCurrency || "brl",
    provider: billing.provider || "asaas",
    status: billing.checkoutMode === "hosted_api" ? "Pagamento iniciado" : "Aguardando pagamento",
    successUrl: billing.successUrl || "",
    cancelUrl: billing.cancelUrl || "",
    requestMode: billing.checkoutMode || "request_only"
  };
  if (options.serviceContext) sessionPayload.serviceContext = options.serviceContext;
  const companyContract = (asaasSubscriptionId = company.asaasSubscriptionId || "") => ({
    ...company,
    planName: sessionPayload.planName,
    planCode: sessionPayload.planCode,
    contractedPlanPrice: sessionPayload.contractedPlanPrice,
    contractedAt: sessionPayload.contractedAt,
    billingCycle: sessionPayload.billingCycle,
    recurringPermissions: sessionPayload.permissions,
    permissions: sessionPayload.permissions,
    asaasSubscriptionId,
    paymentStatus: "Pendente",
    status: "Pendente",
    planActive: false
  });

  const checkoutEndpoint = resolveCheckoutEndpoint(billing.createCheckoutEndpoint, billing);
  if (billing.checkoutMode === "hosted_api" && checkoutEndpoint) {
    try {
      const idToken = await getAuthenticatedCompanyIdToken();
      const secureHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`
      };
      console.info("asaasCheckoutFrontendDebug", {
        step: "before_fetch",
        endpoint: checkoutEndpoint,
        authUid: state.auth?.currentUser?.uid || "",
        authEmail: state.auth?.currentUser?.email || "",
        stateCompanyUid: state.currentCompanyUser?.uid || "",
        profileUid: state.currentCompanyProfile?.uid || "",
        tokenObtained: Boolean(idToken),
        tokenLength: idToken?.length || 0,
        headers: {
          "Content-Type": secureHeaders["Content-Type"],
          Authorization: idToken ? `Bearer ${maskTokenForLog(idToken)} (len=${idToken.length})` : ""
        },
        payload: { planCode: sessionPayload.planCode }
      });
      const response = await fetch(checkoutEndpoint, {
        method: "POST",
        headers: secureHeaders,
        body: JSON.stringify({
          planCode: sessionPayload.planCode,
          serviceContext: options.serviceContext || undefined
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "CHECKOUT_ENDPOINT_FAILED");
      if (data?.url) sessionPayload.sessionUrl = data.url;
      if (data?.sessionId) sessionPayload.gatewaySessionId = data.sessionId;
      sessionPayload.asaasSubscriptionId = data?.asaasSubscriptionId || data?.subscriptionId || "";
      sessionPayload.asaasPaymentId = data?.asaasPaymentId || "";
      sessionPayload.status = data?.status || sessionPayload.status;
      await loadCompanyProfileForCurrentUser();
      if (data?.url) {
        window.location.href = data.url;
        return { redirected: true };
      }
      return { redirected: false, sessionPayload };
    } catch (error) {
      console.error(error);
      sessionPayload.status = "Falha ao iniciar pagamento";
      sessionPayload.errorMessage = error.message || "CHECKOUT_ENDPOINT_FAILED";
      if (state.mode === "cloud") throw error;
      await createPaymentSessionRecord(sessionPayload);
      await createPaymentHistoryRecord({ ...sessionPayload, status: sessionPayload.status });
      if (itemKind === "subscription") await persistCompanyProfile(companyContract());
      throw error;
    }
  }

  await createPaymentSessionRecord(sessionPayload);
  await createPaymentHistoryRecord({ ...sessionPayload, status: sessionPayload.status });
  if (itemKind === "subscription") await persistCompanyProfile(companyContract());
  return { redirected: false, sessionPayload };
}
function showAdminSupportSettingsNotice(message, type = "success") {
  const host = document.getElementById("adminSupportSettingsNoticeHost") || document.getElementById("adminCatalogNoticeHost");
  if (!host) return;
  host.innerHTML = `<div class="inline-success ${type === "error" ? "is-error" : ""}">${escapeHtml(message)}</div>`;
}

async function saveSupportMeetSettingsRecord(payload) {
  const current = getActiveBillingSettings() || {};
  const merged = {
    ...current,
    supportEmail: Object.prototype.hasOwnProperty.call(payload, "supportEmail") ? payload.supportEmail : current.supportEmail,
    supportNr1Whatsapp: Object.prototype.hasOwnProperty.call(payload, "supportNr1Whatsapp") ? payload.supportNr1Whatsapp : current.supportNr1Whatsapp,
    supportNr1Message: Object.prototype.hasOwnProperty.call(payload, "supportNr1Message") ? payload.supportNr1Message : current.supportNr1Message,
    interviewMeetLink: Object.prototype.hasOwnProperty.call(payload, "interviewMeetLink") ? payload.interviewMeetLink : current.interviewMeetLink,
    interviewMeetMessage: Object.prototype.hasOwnProperty.call(payload, "interviewMeetMessage") ? payload.interviewMeetMessage : current.interviewMeetMessage,
    homeAutoApproved: Object.prototype.hasOwnProperty.call(payload, "homeAutoApproved") ? payload.homeAutoApproved : (current.homeAutoApproved !== false),
    homeFeaturedCandidateIds: Object.prototype.hasOwnProperty.call(payload, "homeFeaturedCandidateIds") ? payload.homeFeaturedCandidateIds : (current.homeFeaturedCandidateIds || [])
  };
  await saveBillingSettingsRecord(merged);
}

function initAdminSupportMeetSettingsManagement() {
  const supportForm = document.getElementById("adminSupportSettingsForm");
  const meetForm = document.getElementById("adminMeetSettingsForm");
  fillAdminSupportMeetForms(getActiveBillingSettings());

  if (supportForm) {
    supportForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(supportForm).entries());
      const submit = document.getElementById("adminSupportSettingsSubmitBtn");
      try {
        setButtonBusy(submit, "Salvando...", submit?.textContent || "Salvar suporte / NR1", true);
        await saveSupportMeetSettingsRecord(payload);
        showAdminSupportSettingsNotice("Números e mensagem de suporte/NR1 salvos com sucesso.");
        await hydrateInitialData();
      } catch (error) {
        console.error(error);
        showAdminSupportSettingsNotice("Não foi possível salvar suporte/NR1 agora.", "error");
      } finally {
        setButtonBusy(submit, "Salvando...", submit?.dataset?.idleLabel || "Salvar suporte / NR1", false);
      }
    });
  }

  if (meetForm) {
    meetForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(meetForm).entries());
      const submit = document.getElementById("adminMeetSettingsSubmitBtn");
      try {
        setButtonBusy(submit, "Salvando...", submit?.textContent || "Salvar link do Google Meet", true);
        await saveSupportMeetSettingsRecord(payload);
        showAdminSupportSettingsNotice("Link e mensagem padrão do Google Meet salvos com sucesso.");
        await hydrateInitialData();
      } catch (error) {
        console.error(error);
        showAdminSupportSettingsNotice("Não foi possível salvar o link do Google Meet agora.", "error");
      } finally {
        setButtonBusy(submit, "Salvando...", submit?.dataset?.idleLabel || "Salvar link do Google Meet", false);
      }
    });
  }
}

function initAdminBillingSettingsManagement() {
  const form = document.getElementById("adminBillingSettingsForm");
  if (!form) return;
  fillAdminBillingSettingsForm(getActiveBillingSettings());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    const submit = document.getElementById("adminBillingSettingsSubmitBtn");
    try {
      setButtonBusy(submit, "Salvando...", submit?.textContent || "Salvar configuração", true);
      await saveBillingSettingsRecord(payload);
      showAdminCatalogNotice("Configuração salva com sucesso. O WhatsApp suporte/NR1 já pode ser usado na área da empresa.");
      await hydrateInitialData();
    } catch (error) {
      console.error(error);
      showAdminCatalogNotice("Não foi possível salvar a configuração de cobrança agora.", "error");
    } finally {
      setButtonBusy(submit, "Salvando...", submit?.dataset?.idleLabel || "Salvar configuração", false);
    }
  });
}

function initMenu() {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".main-nav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => nav.classList.toggle("open"));
}

function initTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  if (!buttons.length) return;
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const wrap = btn.closest(".dashboard-layout");
      if (!wrap) return;
      wrap.querySelectorAll(".tab-btn").forEach((item) => item.classList.remove("active"));
      wrap.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
      btn.classList.add("active");
      wrap.querySelector(`#tab-${btn.dataset.tab}`)?.classList.add("active");
    });
  });
}

async function fetchCollection(name, fallback = []) {
  if (state.mode === "cloud" && state.firestore) {
    const snapshot = await getDocs(query(collection(state.firestore, COLLECTIONS[name]), orderBy("createdAt", "desc")));
    return normalizeDocs(snapshot);
  }
  return localStore.get(KEYS[name], fallback);
}

async function saveRecord(name, data) {
  if (state.mode === "cloud" && state.firestore) {
    await addDoc(collection(state.firestore, COLLECTIONS[name]), { ...data, createdAt: serverTimestamp() });
    return;
  }
  const records = localStore.get(KEYS[name], []);
  records.unshift({ id: crypto.randomUUID(), ...data, createdAt: new Date().toLocaleString("pt-BR") });
  localStore.set(KEYS[name], records);
  state[name] = records;
}

async function updateRecord(name, id, data) {
  if (state.mode === "cloud" && state.firestore) {
    await updateDoc(doc(state.firestore, COLLECTIONS[name], id), { ...data, updatedAt: serverTimestamp() });
    return;
  }
  const records = localStore.get(KEYS[name], []);
  const next = records.map((item) => item.id === id ? { ...item, ...data, updatedAt: new Date().toLocaleString("pt-BR") } : item);
  localStore.set(KEYS[name], next);
  state[name] = next;
}

async function deleteRecord(name, id) {
  if (state.mode === "cloud" && state.firestore) {
    await deleteDoc(doc(state.firestore, COLLECTIONS[name], id));
    return;
  }
  const next = localStore.get(KEYS[name], []).filter((item) => item.id !== id);
  localStore.set(KEYS[name], next);
  state[name] = next;
}

const DISC_QUESTIONS = [
  { id: "d1", trait: "D", text: "Assumo a frente quando existe pressão, meta ou decisão difícil." },
  { id: "i1", trait: "I", text: "Tenho facilidade para criar conexão, conversar e motivar pessoas." },
  { id: "s1", trait: "S", text: "Prefiro ambientes cooperativos, estáveis e com boa convivência." },
  { id: "c1", trait: "C", text: "Gosto de seguir padrões, conferir detalhes e evitar erros." },
  { id: "d2", trait: "D", text: "Tomo decisões rapidamente quando percebo que o tempo é curto." },
  { id: "i2", trait: "I", text: "Consigo influenciar pessoas com entusiasmo e comunicação positiva." },
  { id: "s2", trait: "S", text: "Sou paciente para ouvir, apoiar e manter constância no trabalho." },
  { id: "c2", trait: "C", text: "Analiso dados, regras e riscos antes de executar uma tarefa." },
  { id: "d3", trait: "D", text: "Busco resultado direto e não gosto de ficar travado por excesso de conversa." },
  { id: "i3", trait: "I", text: "Costumo ser lembrado pela energia, simpatia ou facilidade de relacionamento." },
  { id: "s3", trait: "S", text: "Tenho boa tolerância para rotina, acompanhamento e processos contínuos." },
  { id: "c3", trait: "C", text: "Fico incomodado quando algo é feito sem critério ou sem organização." },
  { id: "d4", trait: "D", text: "Em conflitos, prefiro enfrentar o problema de forma objetiva." },
  { id: "i4", trait: "I", text: "Aprendo melhor quando posso trocar ideias e participar ativamente." },
  { id: "s4", trait: "S", text: "Procuro manter harmonia mesmo quando há pressão ou mudança." },
  { id: "c4", trait: "C", text: "Tenho cuidado com qualidade, documentação e cumprimento de procedimentos." },
  { id: "d5", trait: "D", text: "Sinto motivação quando recebo desafios, autonomia e metas claras." },
  { id: "i5", trait: "I", text: "Gosto de apresentar ideias, negociar e envolver outras pessoas." },
  { id: "s5", trait: "S", text: "Valorizo segurança, confiança e previsibilidade nas relações de trabalho." },
  { id: "c5", trait: "C", text: "Prefiro instruções claras, critérios definidos e padrões de entrega." },
  { id: "d6", trait: "D", text: "Quando algo não funciona, busco agir rápido para destravar." },
  { id: "i6", trait: "I", text: "Tenho facilidade para animar o ambiente e reduzir tensões por meio da conversa." },
  { id: "s6", trait: "S", text: "Sou consistente, leal e comprometido com a equipe." },
  { id: "c6", trait: "C", text: "Gosto de comparar alternativas antes de escolher o melhor caminho." },
  { id: "d7", trait: "D", text: "Não tenho dificuldade em cobrar prazos, desempenho ou responsabilidade." },
  { id: "i7", trait: "I", text: "Costumo construir redes de relacionamento com facilidade." },
  { id: "s7", trait: "S", text: "Tenho perfil colaborativo e prefiro evoluir com estabilidade." },
  { id: "c7", trait: "C", text: "Sou criterioso com informações, números, normas e detalhes técnicos." },
  { id: "d8", trait: "D", text: "Tenho iniciativa para começar tarefas sem esperar muita orientação." },
  { id: "i8", trait: "I", text: "Expresso ideias com naturalidade e gosto de reconhecimento pelo que faço." },
  { id: "s8", trait: "S", text: "Evito mudanças bruscas quando percebo risco para a equipe ou para a qualidade." },
  { id: "c8", trait: "C", text: "Sou mais confortável quando posso planejar antes de executar." },
  { id: "d9", trait: "D", text: "Tenho competitividade saudável e gosto de superar metas." },
  { id: "i9", trait: "I", text: "Consigo perceber o clima do grupo e adaptar minha comunicação." },
  { id: "s9", trait: "S", text: "Sou confiável para manter processos, cuidar de pessoas e dar continuidade." },
  { id: "c9", trait: "C", text: "Prezo por precisão, responsabilidade e consistência na entrega." },
  { id: "d10", trait: "D", text: "Em situações difíceis, foco primeiro na solução e no resultado." },
  { id: "i10", trait: "I", text: "Tenho facilidade para vender ideias, engajar e representar uma equipe." },
  { id: "s10", trait: "S", text: "Procuro ser equilibrado, diplomático e cuidadoso com o impacto das decisões." },
  { id: "c10", trait: "C", text: "Reviso meu trabalho para garantir que esteja correto e bem apresentado." }
];

const DISC_LABELS = { D: "Dominância", I: "Influência", S: "Estabilidade", C: "Conformidade" };
const DISC_TRAIT_DESCRIPTIONS = {
  D: "foco em resultado, decisão, iniciativa, desafio e enfrentamento de problemas",
  I: "comunicação, persuasão, relacionamento, energia social e influência positiva",
  S: "constância, cooperação, paciência, lealdade, suporte e estabilidade emocional",
  C: "análise, qualidade, precisão, regras, organização, controle e conformidade"
};

function renderDiscQuestionnaire() {
  const host = document.getElementById("discQuestionnaire");
  if (!host) return;
  host.innerHTML = DISC_QUESTIONS.map((question, index) => `
    <div class="disc-question" data-trait="${question.trait}">
      <div class="disc-question-title"><strong>${index + 1}.</strong><span>${escapeHtml(question.text)}</span></div>
      <div class="disc-scale" role="radiogroup" aria-label="${escapeHtml(question.text)}">
        ${[1,2,3,4,5].map((value) => `<label><input type="radio" name="${question.id}" value="${value}" ${value === 3 ? "checked" : ""} required><span>${value}</span></label>`).join("")}
      </div>
    </div>
  `).join("") + `<div class="disc-scale-legend"><span>1 = Discordo totalmente</span><span>2 = Discordo</span><span>3 = Neutro</span><span>4 = Concordo</span><span>5 = Concordo totalmente</span></div>`;
}

function calculateDiscResult(formData) {
  const raw = { D: 0, I: 0, S: 0, C: 0 };
  const max = { D: 0, I: 0, S: 0, C: 0 };
  DISC_QUESTIONS.forEach((question) => {
    const value = Number(formData.get(question.id) || 0);
    raw[question.trait] += value;
    max[question.trait] += 5;
  });
  const percentages = Object.fromEntries(Object.keys(raw).map((trait) => [trait, Math.round((raw[trait] / Math.max(max[trait], 1)) * 100)]));
  const sorted = Object.entries(percentages).sort((a,b) => b[1] - a[1]);
  const dominant = sorted[0]?.[0] || "D";
  const secondary = sorted[1]?.[0] || "I";
  const profileName = `${DISC_LABELS[dominant]} com apoio de ${DISC_LABELS[secondary]}`;
  const interpretation = buildDiscInterpretation(percentages, dominant, secondary);
  return { raw, percentages, dominant, secondary, profileName, interpretation };
}

function buildDiscInterpretation(percentages, dominant, secondary) {
  const high = Object.entries(percentages).filter(([, value]) => value >= 72).map(([trait]) => DISC_LABELS[trait]);
  const low = Object.entries(percentages).filter(([, value]) => value <= 45).map(([trait]) => DISC_LABELS[trait]);
  const strengths = {
    D: "boa iniciativa, senso de urgência, coragem para decidir e foco em resultado",
    I: "comunicação, relacionamento, engajamento e influência sobre pessoas",
    S: "constância, colaboração, escuta, paciência e estabilidade nas entregas",
    C: "organização, precisão, cuidado com qualidade e aderência a regras"
  };
  const cautions = {
    D: "pode acelerar decisões e precisar calibrar escuta, paciência e negociação",
    I: "pode dispersar com facilidade e precisar reforçar rotina, método e acompanhamento",
    S: "pode evitar conflitos e precisar desenvolver exposição, assertividade e adaptação a mudanças",
    C: "pode demorar por excesso de análise e precisar ganhar agilidade em ambientes incertos"
  };
  return {
    resumo: `Perfil predominante em ${DISC_LABELS[dominant]} (${percentages[dominant]}%) com traço secundário de ${DISC_LABELS[secondary]} (${percentages[secondary]}%). Indica ${DISC_TRAIT_DESCRIPTIONS[dominant]}.`,
    pontosFortes: strengths[dominant],
    pontosAtencao: cautions[dominant],
    ambienteIdeal: `Tende a performar melhor em ambiente que valorize ${DISC_TRAIT_DESCRIPTIONS[dominant]} e também permita uso de ${DISC_TRAIT_DESCRIPTIONS[secondary]}.`,
    leituraTecnica: `Altos traços: ${high.length ? high.join(", ") : "nenhum acima de 72%"}. Traços mais baixos: ${low.length ? low.join(", ") : "nenhum abaixo de 45%"}. Esta leitura é uma triagem comportamental e deve ser combinada com entrevista, histórico profissional e parecer da consultora.`
  };
}

function getDiscValue(disc, trait) {
  const percentKey = { D: "dominanciaPercent", I: "influenciaPercent", S: "estabilidadePercent", C: "conformidadePercent" }[trait];
  const legacyKey = { D: "dominancia", I: "influencia", S: "estabilidade", C: "conformidade" }[trait];
  const legacyMap = { "Baixa": 33, "Média": 66, "Alta": 90 };
  const rawValue = disc?.[percentKey] ?? disc?.percentages?.[trait] ?? legacyMap[disc?.[legacyKey]] ?? disc?.[legacyKey] ?? 0;
  const value = Number(rawValue);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function renderDiscChartHtml(disc, compact = false) {
  if (!disc) return "";
  return `<div class="disc-chart ${compact ? "compact" : ""}">${["D","I","S","C"].map((trait) => {
    const value = getDiscValue(disc, trait);
    return `<div class="disc-bar-row"><span>${DISC_LABELS[trait]}</span><div class="disc-bar-track"><i style="width:${value}%"></i></div><strong>${value}%</strong></div>`;
  }).join("")}</div>`;
}

function getCandidateStatus(item) {
  return `${item?.candidateStatus || item?.statusCandidato || item?.processStatus || item?.status || "Em análise"}`.trim() || "Em análise";
}

function isCandidateValidated(item) {
  const status = getCandidateStatus(item).toLowerCase();
  return status.includes("validado") || item?.validated === true || item?.seloConduzir === true;
}

function getCandidateStatusMessage(status) {
  const normalized = `${status || "Em análise"}`.toLowerCase();
  if (normalized.includes("validado")) return "Seu perfil foi validado pela consultoria e pode aparecer para empresas contratantes.";
  if (normalized.includes("avalia")) return "Seu perfil foi selecionado para avaliação. A consultora poderá agendar entrevista e registrar parecer.";
  if (normalized.includes("processo")) return "Seu perfil está participando de um processo seletivo acompanhado pela equipe.";
  if (normalized.includes("contrat")) return "Processo marcado como contratado pela equipe.";
  if (normalized.includes("reprov") || normalized.includes("não valid")) return "Seu perfil permanece na base, mas ainda não recebeu validação da Conduzir.";
  return "Seu perfil está em análise pela equipe da Conduzir.";
}

function getCandidatePublicSummary(item) {
  const feedback = getLatestCandidateFeedback(item);
  const disc = getLatestCandidateDisc(item);
  const discText = disc ? ` DISC: perfil ${disc.perfilDisc || disc.profileName || "comportamental"} — D ${getDiscValue(disc, "D")}% • I ${getDiscValue(disc, "I")}% • S ${getDiscValue(disc, "S")}% • C ${getDiscValue(disc, "C")}%.` : "";
  return `${feedback?.parecerResumo || feedback?.resultado || feedback?.parecer || item.resumo || "Perfil validado disponível para análise da empresa."}${discText}`;
}

function getLatestCandidateFeedback(item) {
  const itemEmail = `${item?.email || item?.candidateEmail || ""}`.toLowerCase();
  if (!itemEmail) return null;
  return state.feedbacks.find((fb) => `${fb.candidateEmail || fb.email || ""}`.toLowerCase() === itemEmail && `${fb.tipo || ""}`.toLowerCase() !== "teste disc") || null;
}

function getLatestCandidateDisc(item) {
  const itemEmail = `${item?.email || item?.candidateEmail || ""}`.toLowerCase();
  if (!itemEmail) return null;
  return state.feedbacks.find((fb) => `${fb.candidateEmail || fb.email || ""}`.toLowerCase() === itemEmail && `${fb.tipo || ""}`.toLowerCase() === "teste disc") || null;
}

function filterCandidatesForCompany(items) {
  const search = state.companyCandidateFilters.search.trim().toLowerCase();
  const area = state.companyCandidateFilters.area.trim().toLowerCase();
  const region = state.companyCandidateFilters.region.trim().toLowerCase();
  return (items || []).filter((item) => {
    if (!isCandidateValidated(item)) return false;
    const matchesSearch = !search || [item.nome, item.email].some((value) => `${value || ""}`.toLowerCase().includes(search));
    const matchesArea = !area || `${item.area || ""}`.toLowerCase().includes(area);
    const matchesRegion = !region || `${item.regiao || ""}`.toLowerCase().includes(region);
    return matchesSearch && matchesArea && matchesRegion;
  });
}


function safeMultiline(value) {
  return escapeHtml(value || "Não preenchido.").replace(/\n/g, "<br>");
}

function getCandidateResumeFileHtml(item) {
  const fileName = item?.curriculoArquivoNome || item?.curriculoArquivo || "";
  const dataUrl = item?.curriculoArquivoDataUrl || "";
  const externalUrl = item?.curriculoArquivoUrl || "";
  if (dataUrl) return `<a class="btn btn-secondary btn-small" href="${escapeHtml(dataUrl)}" target="_blank" rel="noopener" download="${escapeHtml(fileName || 'curriculo-candidato')}">Abrir currículo enviado</a><small>${escapeHtml(fileName || 'Arquivo anexado')}</small>`;
  if (externalUrl) return `<a class="btn btn-secondary btn-small" href="${escapeHtml(externalUrl)}" target="_blank" rel="noopener">Abrir currículo enviado</a><small>${escapeHtml(fileName || externalUrl)}</small>`;
  if (fileName) return `<span class="small-badge">${escapeHtml(fileName)}</span><small>Nome informado sem arquivo anexado.</small>`;
  return `<span class="muted-text">Nenhum arquivo enviado. A consultora verá o currículo preenchido manualmente.</span>`;
}

function renderProfessionalResumeHtml(item, disc = null, compact = false) {
  const experiences = item?.experiencias || item?.experiencia || "";
  const education = item?.formacao || "";
  return `
    <div class="professional-resume ${compact ? 'compact' : ''}">
      <div class="resume-section"><h4>Dados principais</h4><p><strong>Nome:</strong> ${escapeHtml(item?.nome || 'Não informado')}</p><p><strong>E-mail:</strong> ${escapeHtml(item?.email || 'Não informado')}</p><p><strong>Telefone:</strong> ${escapeHtml(item?.telefone || 'Não informado')}</p><p><strong>Região:</strong> ${escapeHtml(item?.regiao || 'Não informada')}</p><p><strong>Área / cargo desejado:</strong> ${escapeHtml(item?.area || item?.cargoDesejado || 'Não informado')}</p><p><strong>Nível:</strong> ${escapeHtml(item?.nivel || 'Não informado')}</p></div>
      <div class="resume-section"><h4>Resumo profissional</h4><p>${safeMultiline(item?.resumo)}</p></div>
      <div class="resume-section"><h4>Experiências profissionais</h4><p>${safeMultiline(experiences)}</p></div>
      <div class="resume-section"><h4>Formação acadêmica</h4><p>${safeMultiline(education)}</p></div>
      <div class="resume-section"><h4>Cursos, certificações e competências</h4><p><strong>Cursos/certificações:</strong><br>${safeMultiline(item?.cursosCertificacoes)}</p><p><strong>Competências técnicas:</strong><br>${safeMultiline(item?.competencias)}</p><p><strong>Idiomas:</strong><br>${safeMultiline(item?.idiomas)}</p></div>
      <div class="resume-section"><h4>Informações complementares</h4><p><strong>Pretensão salarial:</strong> ${escapeHtml(item?.pretensaoSalarial || 'Não informada')}</p><p><strong>Disponibilidade:</strong> ${escapeHtml(item?.disponibilidade || 'Não informada')}</p><p><strong>Modelo de trabalho:</strong> ${escapeHtml(item?.modeloTrabalho || 'Não informado')}</p><p><strong>CNH:</strong> ${escapeHtml(item?.cnh || 'Não informado')}</p><p><strong>LinkedIn/Portfólio:</strong> ${escapeHtml(item?.linkedinPortfolio || 'Não informado')}</p><p><strong>Valores e estilo de trabalho:</strong><br>${safeMultiline(item?.valores)}</p></div>
      <div class="resume-section"><h4>Currículo em arquivo</h4><div class="resume-file-box">${getCandidateResumeFileHtml(item)}</div></div>
      <div class="resume-section"><h4>Teste DISC</h4>${disc ? `<p><strong>Perfil:</strong> ${escapeHtml(disc.perfilDisc || disc.profileName || 'Perfil comportamental')}</p>${renderDiscChartHtml(disc, true)}<p>${escapeHtml(disc.interpretacaoResumo || disc.parecer || disc.resultado || 'DISC preenchido.')}</p>` : '<p>DISC ainda não preenchido.</p>'}</div>
    </div>`;
}

function updateCandidateInterviewBadge() {
  const btn = document.querySelector('[data-tab="entrevistas"]');
  if (!btn || !isCandidatePage()) return;
  const count = getCandidateScopedInterviews(state.interviews).filter((item) => `${item.status || ''}`.toLowerCase().includes('agendada') || `${item.status || ''}`.toLowerCase().includes('reagendada') || `${item.status || ''}`.toLowerCase().includes('confirmada')).length;
  btn.innerHTML = count ? `Entrevistas Agendadas <span class="tab-notification">${count}</span>` : 'Entrevistas Agendadas';
}

function fillConsultantInterviewFormFromCandidate(candidate) {
  const form = document.getElementById('interviewForm');
  if (!form || !candidate) return;
  form.elements.namedItem('interviewId') && (form.elements.namedItem('interviewId').value = '');
  form.elements.namedItem('uid') && (form.elements.namedItem('uid').value = candidate.uid || candidate.id || '');
  form.elements.namedItem('candidato') && (form.elements.namedItem('candidato').value = candidate.nome || '');
  form.elements.namedItem('candidateEmail') && (form.elements.namedItem('candidateEmail').value = candidate.email || '');
  form.elements.namedItem('empresa') && (form.elements.namedItem('empresa').value = 'Conduzir Talentos');
  form.elements.namedItem('formato') && (form.elements.namedItem('formato').value = 'Online');
  form.elements.namedItem('status') && (form.elements.namedItem('status').value = 'Agendada');
  const billing = getActiveBillingSettings();
  const obs = form.elements.namedItem('observacoes');
  if (obs) obs.value = `${billing.interviewMeetMessage || 'Entrevista via Google Meet: clique no link e entre no horário combinado.'}${billing.interviewMeetLink ? `\nLink: ${billing.interviewMeetLink}` : '\nLink: configure o link do Google Meet no painel admin.'}`;
  document.querySelector('[data-tab="agenda"]')?.click();
  createNotice('Dados do candidato enviados para a agenda. Escolha a data/horário e salve.', form.parentElement);
}

function ensureRescheduleInterviewModal() {
  let modal = document.getElementById('rescheduleInterviewModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'rescheduleInterviewModal';
  modal.className = 'reschedule-modal is-hidden';
  modal.innerHTML = `
    <div class="reschedule-modal-backdrop" data-close-reschedule-modal="true"></div>
    <div class="reschedule-modal-card card" role="dialog" aria-modal="true" aria-labelledby="rescheduleModalTitle">
      <div class="panel-head compact-head">
        <div>
          <span class="section-tag">Reagendar entrevista</span>
          <h3 id="rescheduleModalTitle">Nova data e horário</h3>
          <p class="muted-text">O sistema mantém automaticamente candidato, empresa, e-mail, link do Meet e demais dados da entrevista original.</p>
        </div>
        <button class="btn btn-secondary btn-small" type="button" data-close-reschedule-modal="true">Fechar</button>
      </div>
      <form id="rescheduleInterviewForm" class="form-grid">
        <input type="hidden" name="interviewId">
        <label><span>Nova data</span><input type="date" name="data" required></label>
        <label><span>Novo horário</span><input type="time" name="horario" required></label>
        <label class="full"><span>Formato</span><select name="formato"><option>Online</option><option>Presencial</option><option>Google Meet</option><option>Telefone</option></select></label>
        <div class="full form-actions">
          <button class="btn btn-primary" type="submit">Salvar reagendamento</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(modal);

  modal.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-reschedule-modal]')) closeRescheduleInterviewModal();
  });

  modal.querySelector('#rescheduleInterviewForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const id = form.elements.namedItem('interviewId')?.value || '';
    const original = state.interviews.find((item) => `${item.id || ''}` === `${id}`);
    if (!id || !original) {
      createNotice('Não foi possível localizar a entrevista para reagendar.', modal.querySelector('.reschedule-modal-card'));
      return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    const billing = getActiveBillingSettings();
    const payload = {
      ...original,
      data: data.data,
      horario: data.horario,
      formato: data.formato,
      status: 'Reagendada',
      meetLink: original.meetLink || billing.interviewMeetLink || '',
      meetMessage: original.meetMessage || billing.interviewMeetMessage || 'Entrevista via Google Meet: clique no link e entre no horário combinado.',
      rescheduledAt: new Date().toISOString()
    };
    delete payload.id;
    try {
      setButtonBusy(button, 'Salvando...', 'Salvar reagendamento', true);
      await updateRecord('interviews', id, payload);
      if (state.mode === 'local') renderInterviews(state.interviews);
      closeRescheduleInterviewModal();
      createNotice('Entrevista reagendada com sucesso. O candidato já foi notificado na aba Entrevistas Agendadas.', document.getElementById('interviewForm')?.parentElement || document.body);
    } catch (error) {
      console.error(error);
      createNotice('Não foi possível salvar o reagendamento agora.', modal.querySelector('.reschedule-modal-card'));
    } finally {
      setButtonBusy(button, 'Salvando...', 'Salvar reagendamento', false);
    }
  });
  return modal;
}

function openRescheduleInterviewModal(interview) {
  if (!interview) return;
  const modal = ensureRescheduleInterviewModal();
  const form = modal.querySelector('#rescheduleInterviewForm');
  if (!form) return;
  form.elements.namedItem('interviewId').value = interview.id || '';
  form.elements.namedItem('data').value = interview.data || '';
  form.elements.namedItem('horario').value = interview.horario || '';
  form.elements.namedItem('formato').value = interview.formato || 'Online';
  modal.classList.remove('is-hidden');
  setTimeout(() => form.elements.namedItem('data')?.focus(), 50);
}

function closeRescheduleInterviewModal() {
  document.getElementById('rescheduleInterviewModal')?.classList.add('is-hidden');
}

function fillConsultantInterviewFormForReschedule(interview) {
  openRescheduleInterviewModal(interview);
}

function renderCandidateCards(items, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) {
    const message = containerId === "candidateCards"
      ? "Nenhum candidato validado disponível para os filtros atuais. A empresa visualiza somente perfis aprovados pela consultoria."
      : "Cadastre um perfil na área do candidato para visualizar dados aqui.";
    container.innerHTML = `<article class="mini-card"><strong>Nenhum candidato cadastrado</strong><p>${message}</p></article>`;
    return;
  }
  container.innerHTML = safeItems.map((item) => {
    const status = getCandidateStatus(item);
    const validated = isCandidateValidated(item);
    const publicSummary = getCandidatePublicSummary(item);
    const disc = getLatestCandidateDisc(item);
    const id = escapeHtml(item.id || item.uid || "");
    const consultantActions = containerId === "consultantCandidates" ? `
      <div class="candidate-action-row">
        <button class="btn btn-primary btn-small" type="button" data-candidate-action="Validado pela consultora" data-candidate-id="${id}">Aprovar / validar</button>
        <button class="btn btn-secondary btn-small" type="button" data-candidate-action="Não validado" data-candidate-id="${id}">Não aprovar</button>
        <button class="btn btn-secondary btn-small" type="button" data-candidate-action="Em avaliação" data-candidate-id="${id}">Manter em avaliação</button>
        <button class="btn btn-secondary btn-small" type="button" data-schedule-interview="true" data-candidate-id="${id}">Agendar entrevista</button>
      </div>` : "";
    const companyActions = containerId === "candidateCards" ? `
      <div class="candidate-action-row">
        <button class="btn btn-primary btn-small" type="button" data-company-candidate-action="Solicitar contato" data-candidate-name="${escapeHtml(item.nome || "Candidato")}" data-candidate-email="${escapeHtml(item.email || "")}">Solicitar contato</button>
        <button class="btn btn-secondary btn-small" type="button" data-company-candidate-action="Solicitar entrevista" data-candidate-name="${escapeHtml(item.nome || "Candidato")}" data-candidate-email="${escapeHtml(item.email || "")}">Solicitar entrevista</button>
        <button class="btn btn-secondary btn-small" type="button" data-company-candidate-action="Receber mais perfis" data-candidate-name="${escapeHtml(item.nome || "Candidato")}" data-candidate-email="${escapeHtml(item.email || "")}">Receber mais perfis</button>
        <button class="btn btn-secondary btn-small" type="button" data-company-candidate-action="Ver parecer completo" data-candidate-name="${escapeHtml(item.nome || "Candidato")}" data-candidate-email="${escapeHtml(item.email || "")}">Ver parecer completo</button>
        <button class="btn btn-secondary btn-small" type="button" data-company-candidate-action="Solicitar avaliação comportamental" data-candidate-name="${escapeHtml(item.nome || "Candidato")}" data-candidate-email="${escapeHtml(item.email || "")}">Avaliação comportamental</button>
        <button class="btn btn-secondary btn-small" type="button" data-company-candidate-action="Solicitar Book completo" data-candidate-name="${escapeHtml(item.nome || "Candidato")}" data-candidate-email="${escapeHtml(item.email || "")}">Book completo</button>
        <button class="btn btn-secondary btn-small" type="button" data-company-candidate-action="Abrir processo seletivo" data-candidate-name="${escapeHtml(item.nome || "Candidato")}" data-candidate-email="${escapeHtml(item.email || "")}">Abrir processo seletivo</button>
      </div>` : "";
    return `
    <article class="mini-card candidate-card ${validated ? "is-validated" : ""}">
      <div class="candidate-card-head"><strong>${escapeHtml(item.nome || "Sem nome")}</strong><span class="status-pill ${validated ? "validated" : ""}">${escapeHtml(status)}</span></div>
      <p><strong>Área:</strong> ${escapeHtml(item.area || "Não informada")}</p>
      <p><strong>Região:</strong> ${escapeHtml(item.regiao || "Não informada")}</p>
      <p><strong>Nível:</strong> ${escapeHtml(item.nivel || "Não informado")}</p>
      ${containerId === "candidateCards" ? "" : `<p><strong>Acesso:</strong> ${isGeneratedSystemAuthEmail(item.email) ? "Usuário + senha" : escapeHtml(item.email || "Usuário + senha")}</p>`}
      <p><strong>Resumo:</strong> ${escapeHtml(containerId === "candidateCards" ? publicSummary : (item.resumo || "Sem resumo preenchido."))}</p>
      ${containerId === "consultantCandidates" ? `<details class="resume-toggle-box"><summary>Mostrar mais</summary>${renderProfessionalResumeHtml(item, disc, false)}</details>` : ""}
      ${disc && (containerId === "candidateCards" || containerId === "consultantCandidates") ? renderDiscChartHtml(disc, true) : ""}
      ${validated ? `<p class="validated-note">âœ“ Selo Validado pela Conduzir</p>` : ""}
      ${consultantActions}${companyActions}
      ${containerId === "candidateCards" ? renderCandidateLinkedServicesForCompany(item) : ""}
    </article>`;
  }).join("");
}


function getCandidatePlaceholder(index) {
  const placeholders = [
    "assets/candidate-placeholder-1.png",
    "assets/candidate-placeholder-2.png",
    "assets/candidate-placeholder-3.png",
    "assets/candidate-placeholder-4.png"
  ];
  return placeholders[index % placeholders.length];
}

function getHomeFeaturedCandidates(data) {
  const settings = getActiveBillingSettings();
  const all = Array.isArray(data) ? data : [];
  const auto = settings.homeAutoApproved !== false && settings.homeAutoApproved !== "false";
  const selectedIds = Array.isArray(settings.homeFeaturedCandidateIds) ? settings.homeFeaturedCandidateIds.map(String) : [];
  const selectedSet = new Set(selectedIds);
  if (auto) return all.filter(isCandidateValidated).slice(0, 4);
  return all.filter((candidate) => selectedSet.has(String(candidate.id || candidate.uid || ""))).slice(0, 4);
}

function renderHomeCandidates(data) {
  const host = document.getElementById("homeCandidateCards");
  if (!host) return;
  const featured = getHomeFeaturedCandidates(data);
  if (!featured.length) {
    host.innerHTML = `
      <article class="home-empty-state">
        Nenhum perfil foi salvo ainda. Assim que os candidatos forem cadastrados, eles aparecerão aqui automaticamente.
      </article>
    `;
    return;
  }
  host.innerHTML = featured.map((candidate, index) => `
    <article class="home-candidate-card">
      <div class="home-candidate-photo">
        <img src="${escapeHtml(candidate.foto || candidate.fotoUrl || candidate.avatar || getCandidatePlaceholder(index))}" alt="Perfil de ${escapeHtml(candidate.nome || "Candidato")}" />
      </div>
      <div class="home-candidate-content">
        <strong>${escapeHtml(candidate.nome || "Candidato sem nome")}</strong>
        <span>${escapeHtml(candidate.email || "E-mail não informado")}</span>
        <small>${escapeHtml(candidate.area || "Área não informada")}${candidate.regiao ? ` • ${escapeHtml(candidate.regiao)}` : ""}</small>
      </div>
    </article>
  `).join("");
}

function renderAdminHomeFeaturedCandidates() {
  const host = document.getElementById("adminHomeFeaturedCandidatesList");
  if (!host) return;
  const settings = getActiveBillingSettings();
  const auto = settings.homeAutoApproved !== false && settings.homeAutoApproved !== "false";
  const selected = new Set((Array.isArray(settings.homeFeaturedCandidateIds) ? settings.homeFeaturedCandidateIds : []).map(String));
  const candidates = Array.isArray(state.candidates) ? state.candidates : [];
  const autoCheckbox = document.getElementById("homeAutoApproved");
  if (autoCheckbox) autoCheckbox.checked = auto;
  host.innerHTML = candidates.length ? candidates.map((candidate) => {
    const id = String(candidate.id || candidate.uid || "");
    const checked = selected.has(id) ? "checked" : "";
    const status = getCandidateStatus(candidate);
    return `<label class="candidate-select-row"><input type="checkbox" name="homeFeaturedCandidateIds" value="${escapeHtml(id)}" ${checked}> <span><strong>${escapeHtml(candidate.nome || "Candidato sem nome")}</strong><small>${escapeHtml(candidate.email || "Sem e-mail")} • ${escapeHtml(status)}</small></span></label>`;
  }).join("") : '<p class="muted-text">Nenhum candidato cadastrado ainda.</p>';
}

function initAdminHomeFeaturedSettingsManagement() {
  const form = document.getElementById("adminHomeFeaturedForm");
  if (!form) return;
  renderAdminHomeFeaturedCandidates();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const ids = Array.from(form.querySelectorAll('input[name="homeFeaturedCandidateIds"]:checked')).map((input) => input.value);
    const auto = document.getElementById("homeAutoApproved")?.checked;
    try {
      setButtonBusy(submit, "Salvando...", submit?.textContent || "Salvar", true);
      await saveSupportMeetSettingsRecord({ homeAutoApproved: auto, homeFeaturedCandidateIds: ids });
      createNotice("Dados salvos com sucesso.", form.parentElement);
      await hydrateInitialData();
      renderAdminHomeFeaturedCandidates();
    } catch (error) {
      console.error(error);
      createNotice("Não foi possível salvar a seleção de currículos agora.", form.parentElement, "error");
    } finally {
      setButtonBusy(submit, "Salvando...", submit?.dataset?.idleLabel || "Salvar seleção", false);
    }
  });
}

function renderOperationalDashboard() {
  const totalCandidates = state.candidates.length;
  const validatedCount = state.candidates.filter(isCandidateValidated).length;
  const activeCompanies = state.companies.filter((item) => item.planActive === true || item.paymentStatus === "Ativo").length;
  const conversion = totalCandidates ? Math.round((validatedCount / totalCandidates) * 100) : 0;
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  setText("adminValidatedCount", validatedCount);
  setText("adminActiveCompaniesCount", activeCompanies);
  setText("adminConversionRate", `${conversion}%`);
  setText("reportValidatedCandidates", validatedCount);
  setText("reportActiveCompanies", activeCompanies);
  setText("reportConversionRate", `${conversion}%`);
}


function renderCandidateLinkedServicesForCompany(candidate) {
  const services = getCatalogItemsByAudience("service", "candidate_service");
  if (!services.length) return "";
  const candidateId = candidate.id || candidate.uid || "";
  const candidateName = candidate.nome || "Candidato";
  const candidateEmail = candidate.email || "";
  return `
    <div class="candidate-linked-services">
      <h4>Serviços adicionais para este candidato</h4>
      <div class="linked-service-grid">
        ${services.map((service) => `
          <article class="linked-service-card">
            <strong>${escapeHtml(service.title || "Serviço")}</strong>
            <p>${escapeHtml(service.shortDescription || service.description || "Serviço executado pela consultora e vinculado a este currículo.")}</p>
            <div class="price">${formatCurrencyBRL(service.price || 0)}</div>
            <button class="btn btn-primary btn-small" type="button"
              data-company-candidate-service="${escapeHtml(service.code || service.title || "")}"
              data-service-title="${escapeHtml(service.title || "Serviço")}"
              data-service-price="${escapeHtml(service.price || 0)}"
              data-candidate-id="${escapeHtml(candidateId)}"
              data-candidate-name="${escapeHtml(candidateName)}"
              data-candidate-email="${escapeHtml(candidateEmail)}">Contratar para este candidato</button>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function renderCandidateViews(data) {
  state.candidates = Array.isArray(data) ? data : [];
  const scopedCandidates = getCandidateScopedCandidates(state.candidates);
  renderCandidateCards(isCompanyPage() && !companyHasCurriculumAccess() ? [] : filterCandidatesForCompany(state.candidates), "candidateCards");
  renderCandidateCards(state.candidates, "consultantCandidates");
  renderHomeCandidates(state.candidates);

  const preview = document.getElementById("candidateProfilePreview");
  if (preview) {
    const latest = scopedCandidates[0] || state.currentCandidateProfile || null;
    preview.innerHTML = latest
      ? `
      <article class="mini-card"><strong>Área</strong><p>${escapeHtml(latest.area || "Não informada")}</p></article>
      <article class="mini-card"><strong>Nível</strong><p>${escapeHtml(latest.nivel || "Não informado")}</p></article>
      <article class="mini-card full-card">${renderProfessionalResumeHtml(latest, getLatestCandidateDisc(latest), false)}</article>`
      : '<article class="mini-card"><strong>Sem prévia disponível</strong><p>Salve seu perfil para visualizar o resumo aqui.</p></article>';
  }

  const metricCandidates = document.getElementById("metricCandidates");
  if (metricCandidates) metricCandidates.textContent = state.mode === "cloud" ? `${state.candidates.length} candidato(s) salvos na nuvem.` : `${state.candidates.length} candidato(s) cadastrados localmente.`;
  const adminCandidateCount = document.getElementById("adminCandidateCount");
  const reportCandidates = document.getElementById("reportCandidates");
  const companyReportCandidates = document.getElementById("companyReportCandidates");
  const consultantCandidateCount = document.getElementById("consultantCandidateCount");
  if (adminCandidateCount) adminCandidateCount.textContent = state.candidates.length;
  if (reportCandidates) reportCandidates.textContent = state.candidates.length;
  if (companyReportCandidates) companyReportCandidates.textContent = state.candidates.length;
  if (consultantCandidateCount) consultantCandidateCount.textContent = state.candidates.length;
  renderAdminRegistrations();
  renderCandidateStatus();
  renderOperationalDashboard();
}

function renderJobs(items) {
  state.jobs = Array.isArray(items) ? items : [];
  const data = state.jobs.length ? state.jobs : defaultJobs;
  const table = document.getElementById("jobsTable");
  if (table) {
    table.innerHTML = data.map((job) => `
      <tr>
        <td>${escapeHtml(job.titulo || "—")}</td>
        <td>${escapeHtml(job.area || "—")}</td>
        <td>${escapeHtml(job.modelo || "—")}</td>
        <td>${escapeHtml(job.status || "Aberta")}</td>
      </tr>
    `).join("");
  }
  document.getElementById("metricJobs") && (document.getElementById("metricJobs").textContent = `${data.length} vaga(s) registradas.`);
  document.getElementById("adminJobCount") && (document.getElementById("adminJobCount").textContent = data.length);
  document.getElementById("reportJobs") && (document.getElementById("reportJobs").textContent = data.length);
  document.getElementById("companyReportJobs") && (document.getElementById("companyReportJobs").textContent = data.length);
}

function renderFeedbacks(data) {
  state.feedbacks = Array.isArray(data) ? data : [];
  const list = document.getElementById("feedbackList");
  if (list) {
    list.innerHTML = state.feedbacks.length ? state.feedbacks.map((item) => `
      <article class="stack-item">
        <strong>${escapeHtml(item.candidato || "Sem nome")}</strong>
        <p><strong>Status:</strong> ${escapeHtml(item.status || "Não informado")}</p>
        <p><strong>Tipo:</strong> ${escapeHtml(item.tipo || "Parecer técnico")}</p>
        <p><strong>Resultado:</strong> ${escapeHtml(item.resultado || "Não informado")}</p>
        <p>${escapeHtml(item.parecer || "Sem parecer preenchido.")}</p>
      </article>`).join("") : '<article class="mini-card"><strong>Nenhum parecer cadastrado</strong><p>Os pareceres salvos aparecerão aqui.</p></article>';
  }
  document.getElementById("adminFeedbackCount") && (document.getElementById("adminFeedbackCount").textContent = state.feedbacks.length);
  document.getElementById("reportFeedbacks") && (document.getElementById("reportFeedbacks").textContent = state.feedbacks.length);
  document.getElementById("consultantFeedbackCount") && (document.getElementById("consultantFeedbackCount").textContent = state.feedbacks.length);
  renderCandidateTests();
}

function renderServiceRequests(data) {
  state.serviceRequests = Array.isArray(data) ? data : [];
  const candidateItems = getCandidateScopedServiceRequests(state.serviceRequests);
  const candidateList = document.getElementById("candidateServiceList");
  if (candidateList) {
    candidateList.innerHTML = candidateItems.length
      ? candidateItems.map((item) => `
        <article class="stack-item">
          <strong>${escapeHtml(item.tipo || "Serviço")}</strong>
          <p><strong>Acesso:</strong> ${isGeneratedSystemAuthEmail(item.email) ? "Usuário + senha" : escapeHtml(item.email || "Usuário + senha")}</p>
          <p>${escapeHtml(item.mensagem || "Sem detalhes adicionais.")}</p>
        </article>`).join("")
      : '<article class="mini-card"><strong>Nenhuma solicitação enviada</strong><p>As solicitações de serviços adicionais do seu login aparecerão aqui.</p></article>';
  }

  const companyList = document.getElementById("companyRequestsList");
  if (companyList) {
    const companyItems = state.serviceRequests.filter((item) => item.origin === "company" && (!isCompanyPage() || `${item.companyUid||""}` === getCurrentCompanyUid() || `${item.contactEmail||""}`.toLowerCase() === getCurrentCompanyEmail()));
    companyList.innerHTML = companyItems.length
      ? companyItems.map((item) => `
        <article class="stack-item">
          <strong>${escapeHtml(item.empresa || "Empresa")}</strong>
          <p><strong>Solicitação:</strong> ${escapeHtml(item.tipo || "Não informado")}</p><p><strong>ID:</strong> <span class="request-id-badge">${escapeHtml(item.id || "—")}</span></p>
          <p><strong>Responsável:</strong> ${escapeHtml(item.responsavel || "Não informado")}</p>
          <p><strong>Contato:</strong> ${escapeHtml(item.contato || "Não informado")}</p>
          <p>${escapeHtml(item.mensagem || "Sem mensagem.")}</p><span class="service-status"><strong>Status:</strong> ${escapeHtml(item.deliveryStatus || item.status || "Contratado")}</span>${item.deliveryMessage ? `<p><strong>Devolutiva:</strong> ${escapeHtml(item.deliveryMessage)}</p>` : ""}
        </article>`).join("")
      : '<article class="mini-card"><strong>Nenhuma solicitação enviada</strong><p>As solicitações da empresa para a consultora aparecerão aqui.</p></article>';
  }

  const consultantQueue = document.getElementById("consultantServiceQueue");
  if (consultantQueue) {
    const companyItems = state.serviceRequests.filter((item) => item.origin === "company");
    consultantQueue.innerHTML = companyItems.length ? companyItems.map((item) => `
      <article class="stack-item">
        <strong>${escapeHtml(item.empresa || "Empresa")}</strong> <span class="request-id-badge">${escapeHtml(item.id || "—")}</span>
        <p><strong>Serviço:</strong> ${escapeHtml(item.tipo || "Não informado")}</p>
        <p><strong>Responsável:</strong> ${escapeHtml(item.responsavel || "Não informado")}</p>
        <p><strong>Contato:</strong> ${escapeHtml(item.contato || item.contactEmail || "Não informado")}</p>
        <p>${escapeHtml(item.mensagem || "Sem mensagem.")}</p>
        <span class="service-status"><strong>Status:</strong> ${escapeHtml(item.deliveryStatus || item.status || "Contratado")}</span>
        ${item.deliveryMessage ? `<p><strong>Devolutiva:</strong> ${escapeHtml(item.deliveryMessage)}</p>` : ""}
      </article>`).join("") : '<article class="mini-card"><strong>Nenhum serviço contratado</strong><p>Quando a empresa contratar um serviço, ele aparecerá aqui automaticamente.</p></article>';
  }
  document.getElementById("companyReportRequests") && (document.getElementById("companyReportRequests").textContent = state.serviceRequests.filter((item) => item.origin === "company").length);
}

function renderInterviews(data) {
  state.interviews = Array.isArray(data) ? data : [];
  const scopedInterviews = getCandidateScopedInterviews(state.interviews);
  const candidateBody = document.getElementById("candidateInterviews");
  if (candidateBody) {
    candidateBody.innerHTML = scopedInterviews.length ? scopedInterviews.map((item) => `
      <tr>
        <td>${escapeHtml(item.data || "—")}${item.horario ? ` às ${escapeHtml(item.horario)}` : ""}</td>
        <td>${escapeHtml(item.empresa || "—")}</td>
        <td>${escapeHtml(item.formato || "—")}</td>
        <td>${escapeHtml(item.status || "—")}</td>
        <td>${item.meetLink ? `<a class="btn btn-secondary btn-small" href="${escapeHtml(item.meetLink)}" target="_blank" rel="noopener">Entrar no Google Meet</a><br><small>${escapeHtml(item.meetMessage || 'Clique no link e entre no horário da entrevista.')}</small>` : escapeHtml(item.local || item.observacoes || "Aguardando instruções")}</td>
      </tr>`).join("") : '<tr><td>—</td><td>Nenhuma entrevista agendada para este login</td><td>—</td><td>—</td><td>—</td></tr>';
  }
  const consultantBody = document.getElementById("interviewTableBody");
  if (consultantBody) {
    consultantBody.innerHTML = state.interviews.length ? state.interviews.map((item) => {
      const id = escapeHtml(item.id || "");
      return `
      <tr>
        <td>${escapeHtml(item.data || "—")}${item.horario ? ` às ${escapeHtml(item.horario)}` : ""}</td>
        <td>${escapeHtml(item.candidato || "—")}</td>
        <td>${escapeHtml(item.empresa || "—")}</td>
        <td>${escapeHtml(item.formato || "—")}</td>
        <td>
          <div class="interview-status-box"><strong>${escapeHtml(item.status || "—")}</strong>
            <div class="candidate-action-row compact-actions">
              <button class="btn btn-secondary btn-small ${`${item.status || ""}`.toLowerCase().includes("realizada") ? "is-selected" : ""}" type="button" data-interview-status="Realizada" data-interview-id="${id}">${`${item.status || ""}`.toLowerCase().includes("realizada") ? "âœ“ Realizada" : "Realizada"}</button>
              <button class="btn btn-primary btn-small" type="button" data-interview-reschedule="true" data-interview-id="${id}">Reagendar</button>
            </div>
          </div>
        </td>
      </tr>`;
    }).join("") : '<tr><td>—</td><td>Nenhuma entrevista cadastrada</td><td>—</td><td>—</td><td>—</td></tr>';
  }
  document.getElementById("consultantInterviewCount") && (document.getElementById("consultantInterviewCount").textContent = state.interviews.length);
  updateCandidateInterviewBadge();
  renderAdminRegistrations();
  renderCandidateStatus();
}

function renderInternalNotes(data) {
  state.internalNotes = Array.isArray(data) ? data : [];
  const list = document.getElementById("internalNotesList");
  if (!list) return;
  const adminArea = isAdminPage();
  list.innerHTML = state.internalNotes.length ? state.internalNotes.map((item) => {
    const id = item.id || "";
    const respostaAdmin = item.respostaAdmin || "";
    const respondedBy = item.respondedBy || "Administração";
    const respondedAt = item.respondedAt || item.updatedAt || "";
    return `
    <article class="stack-item">
      <div class="panel-head compact-head">
        <div>
          <strong>${escapeHtml(item.titulo || "Anotação interna")}</strong>
          <p><strong>Área:</strong> ${escapeHtml(item.setor || "Geral")}</p>
        </div>
        <span class="small-badge">${respostaAdmin ? "Respondida" : "Aguardando resposta"}</span>
      </div>
      <p>${escapeHtml(item.mensagem || "Sem conteúdo.")}</p>
      <p><strong>Registrado em:</strong> ${formatCreatedAt(item.createdAt)}</p>
      ${respostaAdmin ? `
        <div class="inline-success is-info top-gap">
          <strong>Resposta da administração:</strong>
          <p>${escapeHtml(respostaAdmin)}</p>
          <small>${escapeHtml(respondedBy)}${respondedAt ? ` • ${formatCreatedAt(respondedAt)}` : ""}</small>
        </div>
      ` : ""}
      ${adminArea ? `
        <div class="actions-row top-gap">
          <button type="button" class="btn btn-secondary btn-small" data-internal-note-action="reply" data-internal-note-id="${escapeHtml(id)}">${respostaAdmin ? "Editar resposta" : "Responder"}</button>
          <button type="button" class="btn btn-secondary btn-small danger-button" data-internal-note-action="delete" data-internal-note-id="${escapeHtml(id)}">Excluir</button>
        </div>
      ` : ""}
    </article>`;
  }).join("") : '<article class="mini-card"><strong>Nenhuma anotação interna</strong><p>As anotações estratégicas da consultora aparecerão aqui.</p></article>';
}

function getStatusBadgeClass(value) {
  const normalized = `${value || ""}`.toLowerCase();
  if (["ativo", "liberado", "concluído", "concluido"].includes(normalized)) return "small-badge";
  if (["pendente", "em análise", "em analise"].includes(normalized)) return "small-badge";
  if (["bloqueado", "vencido", "inadimplente"].includes(normalized)) return "small-badge";
  return "small-badge";
}

function renderAdminRegistrations() {
  const renderTarget = (id, html) => {
    const host = document.getElementById(id);
    if (host) host.innerHTML = html;
  };

  const candidateHtml = state.candidates.length ? state.candidates.map((item) => `
    <article class="stack-item">
      <div class="user-item-top">
        <div>
          <strong>${escapeHtml(getAdminCandidateDisplayName(item))}</strong>
          <p><strong>Status:</strong> ${escapeHtml(normalizeStatusValue(item.status || "Ativo"))}</p>
        </div>
        <span class="badge ${getStatusBadgeClass(item.status || "Ativo")}">${escapeHtml(normalizeStatusValue(item.status || "Ativo"))}</span>
      </div>
      <div class="record-meta-grid">
        <p><strong>Acesso:</strong> ${isGeneratedSystemAuthEmail(item.email) ? "Usuário + senha" : escapeHtml(item.email || "Usuário + senha")}</p>
        <p><strong>Telefone:</strong> ${escapeHtml(item.telefone || "Não informado")}</p>
        <p><strong>Área:</strong> ${escapeHtml(item.area || "Não informada")}</p>
        <p><strong>Região:</strong> ${escapeHtml(item.regiao || "Não informada")}</p>
      </div>
      <p><strong>Cadastrado em:</strong> ${formatCreatedAt(item.createdAt)}</p>
    </article>`).join("") : '<article class="mini-card"><strong>Nenhum candidato cadastrado</strong><p>Os cadastros de candidatos aparecerão aqui automaticamente.</p></article>';

  const companyHtml = state.companies.length ? state.companies.map((item) => `
    <article class="stack-item">
      <div class="user-item-top">
        <div>
          <strong>${escapeHtml(getAdminCompanyDisplayName(item))}</strong>
          <p><strong>Status:</strong> ${escapeHtml(normalizeStatusValue(item.status || "Pendente"))}</p>
        </div>
        <span class="badge ${getStatusBadgeClass(item.status || "Pendente")}">${escapeHtml(normalizeStatusValue(item.status || "Pendente"))}</span>
      </div>
      <div class="record-meta-grid">
        <p><strong>Acesso:</strong> ${isGeneratedSystemAuthEmail(item.email) ? "Usuário + senha" : escapeHtml(item.email || "Usuário + senha")}</p>
        <p><strong>Telefone:</strong> ${escapeHtml(item.telefone || "Não informado")}</p>
        <p><strong>CNPJ:</strong> ${escapeHtml(item.cnpj || "Não informado")}</p>
        <p><strong>Plano:</strong> ${escapeHtml(item.planName || "Nenhum")}</p>
        <p><strong>Valor contratado:</strong> ${getContractedPlanPrice(item) ? formatCurrencyBRL(getContractedPlanPrice(item)) : "Nenhum"}</p>
      </div>
      <p><strong>Acesso:</strong> ${escapeHtml(item.planActive || item.paymentStatus === "Ativo" ? "Liberado" : "Bloqueado")}</p>
      <p><strong>Cadastrado em:</strong> ${formatCreatedAt(item.createdAt)}</p>
    </article>`).join("") : '<article class="mini-card"><strong>Nenhuma empresa cadastrada</strong><p>Os cadastros empresariais aparecerão aqui automaticamente.</p></article>';

  ["adminCandidatesList", "adminCandidatesListSecondary"].forEach((id) => renderTarget(id, candidateHtml));
  ["adminCompaniesList", "adminCompaniesListSecondary"].forEach((id) => renderTarget(id, companyHtml));

  document.getElementById("adminCompanyCount") && (document.getElementById("adminCompanyCount").textContent = state.companies.length);
  renderOperationalDashboard();
  document.getElementById("adminCompaniesBadgeCount") && (document.getElementById("adminCompaniesBadgeCount").textContent = state.companies.length);
  document.getElementById("adminCandidatesBadgeCount") && (document.getElementById("adminCandidatesBadgeCount").textContent = state.candidates.length);
  document.getElementById("reportCompanies") && (document.getElementById("reportCompanies").textContent = state.companies.length);
  renderAdminManagedAccounts();
}

function getManagedRecordsByScope(scope) {
  if (scope === "candidatos") return (state.candidates || []).map((item) => ({ ...item, recordType: "candidate" }));
  if (scope === "empresas") return (state.companies || []).map((item) => ({ ...item, recordType: "company" }));
  return (state.systemUsers || []).map((item) => ({ ...item, recordType: "consultant" }));
}

function matchesManagementSearch(item, scope, term) {
  if (!term) return true;
  const fields = scope === "candidatos"
    ? [item.nome, item.email, item.telefone, item.regiao, item.area]
    : scope === "empresas"
      ? [item.empresa, item.nome, item.email, item.login, item.telefone, item.cnpj, item.planName]
      : [item.nome, item.login, item.email, item.perfil, item.status, item.contato];
  return fields.some((value) => `${value || ""}`.toLowerCase().includes(term));
}

function renderAdminManagedAccounts() {
  const list = document.getElementById("adminManagedAccountsList");
  if (!list) return;
  const scope = state.adminManagementScope || "consultoras";
  const term = (state.adminManagementSearchTerm || "").trim().toLowerCase();
  const items = getManagedRecordsByScope(scope).filter((item) => matchesManagementSearch(item, scope, term));
  document.querySelectorAll("[data-management-scope]").forEach((button) => button.classList.toggle("active", button.dataset.managementScope === scope));
  if (!items.length) {
    list.innerHTML = '<article class="mini-card"><strong>Nenhum cadastro encontrado</strong><p>Ajuste o filtro ou aguarde novos registros entrarem no sistema.</p></article>';
    return;
  }
  list.innerHTML = items.map((item) => {
    if (scope === "candidatos") {
      return `
      <article class="stack-item user-item" data-record-type="candidate" data-record-id="${item.id}">
        <div class="user-item-top">
          <div>
            <span class="record-type-badge">Candidato</span>
            <strong>${escapeHtml(getAdminCandidateDisplayName(item))}</strong>
            <p><strong>Status:</strong> ${escapeHtml(normalizeStatusValue(item.status || "Ativo"))}</p>
          </div>
          <span class="badge ${getStatusBadgeClass(item.status || "Ativo")}">${escapeHtml(normalizeStatusValue(item.status || "Ativo"))}</span>
        </div>
        <div class="record-meta-grid">
          <p><strong>Acesso:</strong> ${isGeneratedSystemAuthEmail(item.email) ? "Usuário + senha" : escapeHtml(item.email || "Usuário + senha")}</p>
          <p><strong>Telefone:</strong> ${escapeHtml(item.telefone || "Não informado")}</p>
          <p><strong>Área:</strong> ${escapeHtml(item.area || "Não informada")}</p>
          <p><strong>Região:</strong> ${escapeHtml(item.regiao || "Não informada")}</p>
        </div>
        <div class="form-actions compact-actions">
          <button type="button" class="btn btn-secondary" data-record-action="edit" data-record-scope="candidatos" data-record-id="${item.id}">Editar</button>
          <button type="button" class="btn btn-secondary" data-record-action="toggle-status" data-record-scope="candidatos" data-record-id="${item.id}">${normalizeStatusValue(item.status || "Ativo") === "Bloqueado" ? "Liberar acesso" : "Bloquear acesso"}</button>
          ${item.email ? `<button type="button" class="btn btn-secondary" data-record-action="reset-password" data-record-scope="candidatos" data-record-id="${item.id}">Redefinir senha</button>` : ""}
          <button type="button" class="btn btn-secondary danger-button" data-record-action="delete" data-record-scope="candidatos" data-record-id="${item.id}">Excluir</button>
        </div>
      </article>`;
    }
    if (scope === "empresas") {
      return `
      <article class="stack-item user-item" data-record-type="company" data-record-id="${item.id}">
        <div class="user-item-top">
          <div>
            <span class="record-type-badge">Empresa</span>
            <strong>${escapeHtml(getAdminCompanyDisplayName(item))}</strong>
            <p><strong>Status:</strong> ${escapeHtml(normalizeStatusValue(item.status || "Pendente"))} • <strong>Plano:</strong> ${escapeHtml(item.planName || "Nenhum")}</p>
            <p><strong>Valor contratado:</strong> ${getContractedPlanPrice(item) ? formatCurrencyBRL(getContractedPlanPrice(item)) : "Nenhum"}${item.contractedAt ? ` • Contratado em ${escapeHtml(formatCreatedAt(item.contractedAt))}` : ""}</p>
          </div>
          <span class="badge ${getStatusBadgeClass(item.status || "Pendente")}">${escapeHtml(normalizeStatusValue(item.status || "Pendente"))}</span>
        </div>
        <div class="record-meta-grid">
          <p><strong>Acesso:</strong> ${isGeneratedSystemAuthEmail(item.email) ? "Usuário + senha" : escapeHtml(item.email || "Usuário + senha")}</p>
          <p><strong>Login:</strong> ${escapeHtml(item.login || "Não informado")}</p>
          <p><strong>Telefone:</strong> ${escapeHtml(item.telefone || "Não informado")}</p>
          <p><strong>CNPJ:</strong> ${escapeHtml(item.cnpj || "Não informado")}</p>
        </div>
        <div class="form-actions compact-actions">
          <button type="button" class="btn btn-secondary" data-record-action="edit" data-record-scope="empresas" data-record-id="${item.id}">Editar</button>
          <button type="button" class="btn btn-secondary" data-record-action="toggle-status" data-record-scope="empresas" data-record-id="${item.id}">${normalizeStatusValue(item.status || "Pendente") === "Bloqueado" ? "Liberar acesso" : "Bloquear acesso"}</button>
          ${item.email ? `<button type="button" class="btn btn-secondary" data-record-action="reset-password" data-record-scope="empresas" data-record-id="${item.id}">Redefinir senha</button>` : ""}
          <button type="button" class="btn btn-secondary danger-button" data-record-action="delete" data-record-scope="empresas" data-record-id="${item.id}">Excluir</button>
        </div>
      </article>`;
    }
    return `
    <article class="stack-item user-item" data-user-id="${item.id}">
      <div class="user-item-top">
        <div>
          <span class="record-type-badge">Consultora</span>
          <strong>${escapeHtml(item.nome || "Sem nome")}</strong>
          <p><strong>Perfil:</strong> ${escapeHtml(item.perfil || "Não informado")} • <strong>Status:</strong> ${escapeHtml(item.status || "Não informado")}</p>
        </div>
        <span class="badge ${getStatusBadgeClass(item.status || "Ativo")}">${escapeHtml(item.status || "Ativo")}</span>
      </div>
      <div class="record-meta-grid">
        <p><strong>Login:</strong> ${escapeHtml(item.login || "—")}</p>
        <p><strong>Acesso:</strong> ${isGeneratedSystemAuthEmail(item.email) ? "Usuário + senha" : escapeHtml(item.email || "Usuário + senha")}</p>
        <p><strong>Contato:</strong> ${escapeHtml(item.contato || "Não informado")}</p>
        <p><strong>Cadastrado em:</strong> ${formatCreatedAt(item.createdAt)}</p>
      </div>
      <p><strong>Observações:</strong> ${escapeHtml(item.observacoes || "Sem observações internas.")}</p>
      <div class="form-actions compact-actions">
        <button type="button" class="btn btn-secondary" data-user-action="edit" data-user-id="${item.id}">Editar</button>
        ${item.perfil === "Administrador" ? "" : `<button type="button" class="btn btn-secondary" data-user-action="toggle-status" data-user-id="${item.id}">${item.status === "Bloqueado" ? "Liberar acesso" : "Bloquear acesso"}</button>`}
        ${item.email && !isGeneratedSystemAuthEmail(item.email) ? `<button type="button" class="btn btn-secondary" data-user-action="reset-password" data-user-id="${item.id}">Redefinir senha</button>` : ""}
        ${item.perfil === "Administrador" ? "" : `<button type="button" class="btn btn-secondary danger-button" data-user-action="delete" data-user-id="${item.id}">Excluir</button>`}
      </div>
    </article>`;
  }).join("");
}

function renderSystemUsers(data) {
  state.systemUsers = Array.isArray(data) ? data : [];
  const term = state.adminUserSearchTerm.trim().toLowerCase();
  const filteredUsers = term ? state.systemUsers.filter((item) => [item.nome, item.login, item.email, item.perfil, item.status].some((value) => `${value || ""}`.toLowerCase().includes(term))) : state.systemUsers;
  const list = document.getElementById("adminUsersList");
  if (list) {
    list.innerHTML = filteredUsers.length ? filteredUsers.map((item) => `
      <article class="stack-item user-item" data-user-id="${item.id}">
        <div class="user-item-top">
          <div>
            <strong>${escapeHtml(item.nome || "Sem nome")}</strong>
            <p><strong>Perfil:</strong> ${escapeHtml(item.perfil || "Não informado")} • <strong>Status:</strong> ${escapeHtml(item.status || "Não informado")}</p>
          </div>
          <span class="badge small-badge">${escapeHtml(item.status || "Ativo")}</span>
        </div>
        <div class="user-credentials-grid">
          <p><strong>Login:</strong> <span>${escapeHtml(item.login || "—")}</span></p>
          <p><strong>E-mail:</strong> <span>${escapeHtml(item.email || "Não informado")}</span></p>
          <p><strong>Contato:</strong> <span>${escapeHtml(item.contato || "Não informado")}</span></p>
          <p><strong>Cadastrado em:</strong> <span>${formatCreatedAt(item.createdAt)}</span></p>
        </div>
        <p><strong>Observações:</strong> ${escapeHtml(item.observacoes || "Sem observações internas.")}</p>
        <div class="form-actions compact-actions">
          <button type="button" class="btn btn-secondary" data-user-action="edit" data-user-id="${item.id}">Editar</button>
          ${item.perfil === "Administrador" ? "" : `<button type="button" class="btn btn-secondary" data-user-action="toggle-status" data-user-id="${item.id}">${item.status === "Bloqueado" ? "Liberar acesso" : "Bloquear acesso"}</button>`}
          ${item.email ? `<button type="button" class="btn btn-secondary" data-user-action="reset-password" data-user-id="${item.id}">Enviar redefinição</button>` : ""}
          ${item.perfil === "Administrador" ? "" : `<button type="button" class="btn btn-secondary danger-button" data-user-action="delete" data-user-id="${item.id}">Excluir</button>`}
        </div>
      </article>`).join("") : '<article class="mini-card"><strong>Nenhum usuário encontrado</strong><p>Cadastre um novo acesso acima ou ajuste sua busca.</p></article>';
  }
  const preview = document.getElementById("adminUsersPreview");
  if (preview) {
    preview.innerHTML = state.systemUsers.length ? state.systemUsers.slice(0, 4).map((item) => `
      <article class="mini-card">
        <strong>${escapeHtml(item.nome || "Sem nome")}</strong>
        <p><strong>Perfil:</strong> ${escapeHtml(item.perfil || "Não informado")}</p>
        <p><strong>Login:</strong> ${escapeHtml(item.login || "—")}</p>
        <p><strong>Acesso:</strong> ${isGeneratedSystemAuthEmail(item.email) ? "Usuário + senha" : escapeHtml(item.email || "Usuário + senha")}</p>
      </article>`).join("") : '<article class="mini-card"><strong>Nenhum usuário criado ainda</strong><p>Cadastre o primeiro login na aba Gestão de Usuários.</p></article>';
  }
  document.getElementById("adminUserCount") && (document.getElementById("adminUserCount").textContent = state.systemUsers.length);
  document.getElementById("adminUsersBadgeCount") && (document.getElementById("adminUsersBadgeCount").textContent = state.systemUsers.length);
  document.getElementById("reportUsers") && (document.getElementById("reportUsers").textContent = state.systemUsers.length);
  renderAdminManagedAccounts();
}

function renderCandidateTests() {
  const grid = document.getElementById("candidateTestsGrid");
  if (!grid) return;
  const scopedFeedbacks = getCandidateScopedFeedbacks(state.feedbacks);
  const latestCandidate = (getCandidateScopedCandidates(state.candidates)[0] || state.currentCandidateProfile || {});
  const disc = getLatestCandidateDisc(latestCandidate) || scopedFeedbacks.find((item) => `${item.tipo || ""}`.toLowerCase() === "teste disc");
  const hasDiscRequest = getCandidateScopedServiceRequests(state.serviceRequests).some((item) => `${item.tipo || ""}`.toLowerCase().includes("disc"));
  const totalFeedbacks = scopedFeedbacks.length;
  grid.innerHTML = `
    <article class="mini-card"><strong>Perfil comportamental</strong><p>Status: ${disc ? "DISC preenchido e disponível para análise" : hasDiscRequest ? "DISC solicitado pela consultoria" : totalFeedbacks ? "em análise pela consultoria" : "aguardando aplicação"}.</p></article>
    <article class="mini-card"><strong>Avaliação psicossocial</strong><p>Status: ${totalFeedbacks > 1 ? "há registros no sistema" : "em triagem"}.</p></article>
    <article class="mini-card"><strong>Teste técnico</strong><p>Status: ${totalFeedbacks ? "acompanhe atualizações no parecer da consultora" : "ainda não solicitado"}.</p></article>`;
  const discHost = document.getElementById("candidateDiscResult");
  if (discHost) {
    discHost.innerHTML = disc ? `
      <article class="stack-item disc-result-card">
        <strong>DISC profissional salvo</strong>
        <p><strong>Perfil:</strong> ${escapeHtml(disc.perfilDisc || disc.profileName || "Perfil comportamental calculado")}</p>
        ${renderDiscChartHtml(disc)}
        <p><strong>Resumo:</strong> ${escapeHtml(disc.interpretacaoResumo || disc.resultado || "Resultado DISC calculado em percentual.")}</p>
        <p><strong>Pontos fortes:</strong> ${escapeHtml(disc.pontosFortes || "Aguardando leitura da consultora.")}</p>
        <p><strong>Pontos de atenção:</strong> ${escapeHtml(disc.pontosAtencao || "Aguardando leitura da consultora.")}</p>
        <p><strong>Observações:</strong> ${escapeHtml(disc.observacoes || "Sem observações adicionais.")}</p>
      </article>` : '<article class="mini-card"><strong>Nenhum DISC preenchido</strong><p>Quando a consultora solicitar, preencha o teste profissional e salve nesta área. O gráfico será calculado automaticamente.</p></article>';
  }}

function renderCandidateStatus() {
  const timeline = document.getElementById("candidateProcessTimeline");
  if (!timeline) return;
  const scopedCandidates = getCandidateScopedCandidates(state.candidates);
  const latest = scopedCandidates[0] || state.currentCandidateProfile || null;
  const status = getCandidateStatus(latest || {});
  const scopedFeedbacks = getCandidateScopedFeedbacks(state.feedbacks);
  const scopedInterviews = getCandidateScopedInterviews(state.interviews);
  const scopedServices = getCandidateScopedServiceRequests(state.serviceRequests);
  const validated = isCandidateValidated(latest || {});
  timeline.innerHTML = `
    <div class="candidate-status-banner ${validated ? "is-valid" : ""}">
      <strong>Status atual: ${escapeHtml(status)}</strong>
      <span>${escapeHtml(getCandidateStatusMessage(status))}</span>
    </div>
    <div class="timeline-item done"><strong>Cadastro realizado</strong><span>${scopedCandidates.length || state.currentCandidateProfile ? "Perfil individual salvo no sistema." : "Preencha e salve seu perfil para ativar sua área individual."}</span></div>
    <div class="timeline-item ${status.toLowerCase().includes("análise") || scopedFeedbacks.length ? "done" : ""}"><strong>Em análise</strong><span>${scopedFeedbacks.length ? "Há pareceres ou avaliações vinculados ao seu login." : "Aguardando análise da consultoria."}</span></div>
    <div class="timeline-item ${status.toLowerCase().includes("avalia") || scopedInterviews.length ? "done" : ""}"><strong>Em avaliação / entrevista</strong><span>${scopedInterviews.length ? "Existe entrevista ou acompanhamento registrado para você." : "A consultora atualizará esta etapa quando houver entrevista ou teste."}</span></div>
    <div class="timeline-item ${validated ? "done" : ""}"><strong>Validado pela Conduzir</strong><span>${validated ? "Seu perfil está liberado para empresas contratantes." : "A validação depende exclusivamente da decisão da consultora."}</span></div>
    <div class="timeline-item ${status.toLowerCase().includes("processo") || status.toLowerCase().includes("contrat") ? "done" : ""}"><strong>Processo seletivo / contratação</strong><span>${status.toLowerCase().includes("contrat") ? "Processo marcado como contratado." : "Será atualizado quando houver compatibilidade com uma empresa."}</span></div>
    <div class="timeline-item ${scopedServices.length ? "done" : ""}"><strong>Serviços adicionais</strong><span>${scopedServices.length ? "Há solicitações registradas no seu login." : "Você pode solicitar apoio em currículo, testes e carreira."}</span></div>`;
}


async function saveCandidate(data) {
  await persistCandidateProfile(data);
  await loadCandidateProfileForCurrentUser();
  await hydrateInitialData();
}

async function saveJob(data) {
  await saveRecord("jobs", { ...data, status: "Aberta", companyUid: getCurrentCompanyUid(), companyEmail: getCurrentCompanyEmail(), empresa: state.currentCompanyProfile?.empresa || state.currentCompanyUser?.displayName || "" });
  if (state.mode === "local") renderJobs(state.jobs.length ? state.jobs : defaultJobs);
}

async function saveFeedback(data) {
  await saveRecord("feedbacks", data);
  if (state.mode === "local") renderFeedbacks(state.feedbacks);
}

async function saveServiceRequest(data) {
  await saveRecord("serviceRequests", data);
  if (state.mode === "local") renderServiceRequests(state.serviceRequests);
}

async function saveInterview(data) {
  await saveRecord("interviews", data);
  if (state.mode === "local") renderInterviews(state.interviews);
}

async function saveInternalNote(data) {
  await saveRecord("internalNotes", data);
  if (state.mode === "local") renderInternalNotes(state.internalNotes);
}

async function findExistingUserByLogin(login, ignoreId = "") {
  const normalizedLogin = `${login || ""}`.trim().toLowerCase();
  if (!normalizedLogin) return null;
  const users = state.systemUsers.length ? state.systemUsers : await fetchCollection("systemUsers", []);
  return users.find((item) => item.id !== ignoreId && `${item.login || ""}`.trim().toLowerCase() === normalizedLogin) || null;
}

async function findExistingUserByEmail(email, ignoreId = "") {
  const normalizedEmail = `${email || ""}`.trim().toLowerCase();
  if (!normalizedEmail) return null;
  const users = state.systemUsers.length ? state.systemUsers : await fetchCollection("systemUsers", []);
  return users.find((item) => item.id !== ignoreId && `${item.email || ""}`.trim().toLowerCase() === normalizedEmail) || null;
}

async function saveSystemUser(data) {
  data = prepareSystemUserPayload(data);
  if ((data.perfil || "") === "Administrador") {
    const existingUsers = state.systemUsers.length ? state.systemUsers : await fetchCollection("systemUsers", []);
    const existingMasterAdmin = existingUsers.find((item) => isMasterAdminRecord(item));
    if (existingMasterAdmin) throw new Error("MASTER_ADMIN_EXISTS");
  }
  const duplicatedLogin = await findExistingUserByLogin(data.login);
  if (duplicatedLogin) throw new Error("LOGIN_EXISTS");
  const duplicatedEmail = await findExistingUserByEmail(data.email);
  if (duplicatedEmail) throw new Error("EMAIL_EXISTS");

  if (state.mode === "cloud" && state.auth) {
    if (!data.login || !data.senha) throw new Error("LOGIN_AND_PASSWORD_REQUIRED");
    const authUser = await createSystemAuthAccount(data.email, data.senha, data.nome || data.login || "");
    const payload = {
      nome: data.nome || data.login || "",
      login: data.login || "",
      email: `${data.email || ""}`.trim().toLowerCase(),
      emailTecnico: isGeneratedSystemAuthEmail(data.email),
      perfil: data.perfil || "Consultora",
      status: data.status || "Ativo",
      contato: data.contato || "",
      observacoes: data.observacoes || "",
      uid: authUser.uid,
      authProvider: "firebase"
    };
    await setDoc(doc(state.firestore, COLLECTIONS.systemUsers, authUser.uid), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    await hydrateInitialData();
    return;
  }

  const sanitizedLocalData = {
    ...data,
    emailTecnico: isGeneratedSystemAuthEmail(data.email),
    senha: "",
    authProvider: "local-disabled"
  };
  await saveRecord("systemUsers", sanitizedLocalData);
  if (state.mode === "local") renderSystemUsers(state.systemUsers);
}

async function updateSystemUserRecord(userId, data) {
  if (!userId) throw new Error("USER_ID_REQUIRED");
  const currentUser = state.systemUsers.find((item) => item.id === userId) || null;
  data = prepareSystemUserPayload(data, currentUser);
  if (isMasterAdminRecord(currentUser)) {
    data.login = MASTER_ADMIN.login;
    data.email = MASTER_ADMIN.email;
    data.perfil = "Administrador";
  }
  const duplicatedLogin = await findExistingUserByLogin(data.login, userId);
  if (duplicatedLogin) throw new Error("LOGIN_EXISTS");
  const duplicatedEmail = await findExistingUserByEmail(data.email, userId);
  if (duplicatedEmail) throw new Error("EMAIL_EXISTS");

  if (state.mode === "cloud" && state.firestore) {
    const payload = {
      nome: data.nome || data.login || "",
      login: data.login || "",
      email: `${data.email || ""}`.trim().toLowerCase(),
      emailTecnico: isGeneratedSystemAuthEmail(data.email),
      perfil: data.perfil || "Consultora",
      status: data.status || "Ativo",
      contato: data.contato || "",
      observacoes: data.observacoes || "",
      updatedAt: serverTimestamp()
    };
    await updateDoc(doc(state.firestore, COLLECTIONS.systemUsers, userId), payload);
    await hydrateInitialData();
    return;
  }

  const sanitizedLocalData = {
    ...data,
    emailTecnico: isGeneratedSystemAuthEmail(data.email),
    senha: currentUser?.senha || ""
  };
  await updateRecord("systemUsers", userId, sanitizedLocalData);
  if (state.mode === "local") renderSystemUsers(state.systemUsers);
}

async function deleteSystemUserRecord(userId) {
  if (!userId) throw new Error("USER_ID_REQUIRED");
  await deleteRecord("systemUsers", userId);
  if (state.mode === "local") renderSystemUsers(state.systemUsers);
}

async function toggleSystemUserStatus(user) {
  if (!user?.id) throw new Error("USER_ID_REQUIRED");
  if (isMasterAdminRecord(user)) throw new Error("MASTER_ADMIN_PROTECTED");
  const nextStatus = `${user.status || "Ativo"}` === "Bloqueado" ? "Ativo" : "Bloqueado";
  await updateSystemUserRecord(user.id, { ...user, status: nextStatus });
  return nextStatus;
}

async function sendSystemUserReset(user) {
  if (!user?.email) throw new Error("EMAIL_REQUIRED");
  if (!state.auth) throw new Error("AUTH_NOT_READY");
  await sendPasswordResetEmail(state.auth, `${user.email}`.trim().toLowerCase());
}

async function updateCandidateRecord(userId, data) {
  if (!userId) throw new Error("USER_ID_REQUIRED");
  const current = state.candidates.find((item) => item.id === userId) || {};
  const payload = {
    ...current,
    nome: `${data.nome || current.nome || ""}`.trim(),
    email: normalizeEmail(data.email || current.email || ""),
    telefone: `${data.telefone || current.telefone || ""}`.trim(),
    regiao: `${data.regiao || current.regiao || ""}`.trim(),
    area: `${data.area || current.area || ""}`.trim(),
    nivel: `${data.nivel || current.nivel || ""}`.trim(),
    status: normalizeStatusValue(data.status || current.status || "Ativo"),
    updatedAt: state.mode === "cloud" ? serverTimestamp() : new Date().toLocaleString("pt-BR")
  };
  if (state.mode === "cloud" && state.firestore) {
    await setDoc(doc(state.firestore, COLLECTIONS.candidates, userId), payload, { merge: true });
  } else {
    await updateRecord("candidates", userId, payload);
  }
}

async function updateCompanyRecord(userId, data) {
  if (!userId) throw new Error("USER_ID_REQUIRED");
  const current = state.companies.find((item) => item.id === userId) || {};
  const payload = {
    ...current,
    empresa: `${data.empresa || current.empresa || ""}`.trim(),
    email: normalizeEmail(data.email || current.email || ""),
    login: `${data.login || current.login || ""}`.trim(),
    telefone: `${data.telefone || current.telefone || ""}`.trim(),
    cnpj: `${data.cnpj || current.cnpj || ""}`.trim(),
    planName: `${data.planName || current.planName || ""}`.trim(),
    planCode: `${data.planCode || current.planCode || ""}`.trim(),
    contractedPlanPrice: data.contractedPlanPrice ?? current.contractedPlanPrice ?? current.planPrice ?? 0,
    contractedAt: data.contractedAt || current.contractedAt || "",
    billingCycle: `${data.billingCycle || current.billingCycle || "mensal"}`.trim(),
    asaasSubscriptionId: `${data.asaasSubscriptionId || current.asaasSubscriptionId || ""}`.trim(),
    paymentStatus: `${data.paymentStatus || current.paymentStatus || "Pendente"}`.trim(),
    planActive: ["ativo", "liberado", "true", "sim"].includes(`${data.planActive ?? current.planActive ?? false}`.toString().trim().toLowerCase()),
    status: normalizeStatusValue(data.status || current.status || "Pendente"),
    updatedAt: state.mode === "cloud" ? serverTimestamp() : new Date().toLocaleString("pt-BR")
  };
  if (state.mode === "cloud" && state.firestore) {
    await setDoc(doc(state.firestore, COLLECTIONS.companies, userId), payload, { merge: true });
  } else {
    await updateRecord("companies", userId, payload);
  }
}

async function toggleCandidateRecordStatus(user) {
  const nextStatus = normalizeStatusValue(user?.status || "Ativo") === "Bloqueado" ? "Ativo" : "Bloqueado";
  await updateCandidateRecord(user.id, { ...user, status: nextStatus });
  return nextStatus;
}

async function toggleCompanyRecordStatus(user) {
  const nextStatus = normalizeStatusValue(user?.status || "Pendente") === "Bloqueado" ? "Pendente" : "Bloqueado";
  await updateCompanyRecord(user.id, { ...user, status: nextStatus });
  return nextStatus;
}

async function softDeleteCandidateRecord(user) {
  await updateCandidateRecord(user.id, { ...user, status: "Excluído" });
}

async function softDeleteCompanyRecord(user) {
  await updateCompanyRecord(user.id, { ...user, status: "Excluído", planActive: false, paymentStatus: "Bloqueado" });
}

async function promptEditManagedRecord(scope, user) {
  if (!user) return false;
  if (scope === "candidatos") {
    const nome = window.prompt("Nome do candidato:", user.nome || "");
    if (nome === null) return false;
    const email = window.prompt("E-mail do candidato:", user.email || "");
    if (email === null) return false;
    const telefone = window.prompt("Telefone do candidato:", user.telefone || "");
    if (telefone === null) return false;
    const regiao = window.prompt("Região do candidato:", user.regiao || "");
    if (regiao === null) return false;
    const area = window.prompt("Área do candidato:", user.area || "");
    if (area === null) return false;
    const nivel = window.prompt("Nível do candidato:", user.nivel || "");
    if (nivel === null) return false;
    const status = window.prompt("Status do candidato (Ativo, Bloqueado, Excluído, Em análise):", normalizeStatusValue(user.status || "Ativo"));
    if (status === null) return false;
    await updateCandidateRecord(user.id, { nome, email, telefone, regiao, area, nivel, status });
    return true;
  }
  const empresa = window.prompt("Nome da empresa:", user.empresa || "");
  if (empresa === null) return false;
  const email = window.prompt("E-mail da empresa:", user.email || "");
  if (email === null) return false;
  const login = window.prompt("Login da empresa:", user.login || "");
  if (login === null) return false;
  const telefone = window.prompt("Telefone da empresa:", user.telefone || "");
  if (telefone === null) return false;
  const cnpj = window.prompt("CNPJ da empresa:", user.cnpj || "");
  if (cnpj === null) return false;
  const planName = window.prompt("Plano atual da empresa:", user.planName || "");
  if (planName === null) return false;
  const paymentStatus = window.prompt("Status comercial/pagamento:", user.paymentStatus || "Pendente");
  if (paymentStatus === null) return false;
  const status = window.prompt("Status da empresa (Pendente, Ativo, Bloqueado, Excluído):", normalizeStatusValue(user.status || "Pendente"));
  if (status === null) return false;
  const planActive = window.confirm("A empresa deve ficar com acesso liberado ao plano? Clique em OK para Sim ou Cancelar para Não.");
  await updateCompanyRecord(user.id, { empresa, email, login, telefone, cnpj, planName, paymentStatus, status, planActive });
  return true;
}

function initHelpWidget() {
  const helpFab = document.getElementById("helpFab");
  const helpModal = document.getElementById("helpModal");
  if (!helpFab || !helpModal) return;

  const faqItems = Array.from(helpModal.querySelectorAll('.help-faq-list details'));

  faqItems.forEach((item) => {
    const summary = item.querySelector('summary');
    if (!summary) return;

    const contentNodes = Array.from(item.children).filter((child) => child.tagName !== 'SUMMARY');
    if (contentNodes.length && !item.querySelector('.faq-answer-wrap')) {
      const wrap = document.createElement('div');
      wrap.className = 'faq-answer-wrap';
      const inner = document.createElement('div');
      inner.className = 'faq-answer-inner';
      contentNodes.forEach((node) => inner.appendChild(node));
      wrap.appendChild(inner);
      item.appendChild(wrap);
    }

    summary.addEventListener('click', (event) => {
      event.preventDefault();
      const willOpen = !item.hasAttribute('open');
      faqItems.forEach((other) => {
        if (other !== item) other.removeAttribute('open');
      });
      if (willOpen) item.setAttribute('open', '');
      else item.removeAttribute('open');
    });
  });

  if (!faqItems.some((item) => item.hasAttribute('open')) && faqItems[0]) {
    faqItems[0].setAttribute('open', '');
  }

  const openModal = () => {
    helpModal.classList.remove("is-hidden");
    helpModal.setAttribute("aria-hidden", "false");
  };
  const closeModal = () => {
    helpModal.classList.add("is-hidden");
    helpModal.setAttribute("aria-hidden", "true");
  };
  helpFab.addEventListener("click", openModal);
  helpModal.querySelectorAll("[data-help-close]").forEach((item) => item.addEventListener("click", closeModal));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !helpModal.classList.contains("is-hidden")) closeModal();
  });
}

function fallbackCandidateRender() {
  state.candidates = localStore.get(KEYS.candidates, []);
  renderCandidateViews(state.candidates);
}
function fallbackJobRender() {
  const jobs = localStore.get(KEYS.jobs, defaultJobs);
  renderJobs(jobs.length ? jobs : defaultJobs);
}
function fallbackFeedbackRender() {
  state.feedbacks = localStore.get(KEYS.feedbacks, []);
  renderFeedbacks(state.feedbacks);
}
function fallbackSystemUsersRender() {
  state.systemUsers = localStore.get(KEYS.systemUsers, []);
  renderSystemUsers(state.systemUsers);
}
function fallbackServiceRequestRender() {
  state.serviceRequests = localStore.get(KEYS.serviceRequests, []);
  renderServiceRequests(state.serviceRequests);
}
function fallbackInterviewRender() {
  state.interviews = localStore.get(KEYS.interviews, []);
  renderInterviews(state.interviews);
}
function fallbackInternalNotesRender() {
  state.internalNotes = localStore.get(KEYS.internalNotes, []);
  renderInternalNotes(state.internalNotes);
}
function fallbackCompanyRender() {
  state.companies = localStore.get(KEYS.companies, []);
  renderAdminRegistrations();
}

function initCandidatePage() {
  if (!isCandidatePage()) return;

  const loginForm = document.getElementById("candidateLoginForm");
  const registerForm = document.getElementById("candidateRegisterForm");
  const logoutButton = document.getElementById("candidateLogoutBtn");
  const form = document.getElementById("candidateForm");
  const successMessage = document.getElementById("candidateSuccessMessage");
  const submitButton = document.getElementById("candidateSubmitBtn");
  const submitArea = form?.parentElement;
  let isSubmitting = false;
  let lastSubmissionFingerprint = "";
  let lastSubmissionAt = 0;
  let buttonCooldownTimer = null;
  renderDiscQuestionnaire();

  function showCandidateMessage(message, type = "success") {
    if (successMessage) {
      successMessage.textContent = message;
      successMessage.style.display = "block";
      successMessage.classList.remove("is-error", "is-info");
      if (type === "error") successMessage.classList.add("is-error");
      if (type === "info") successMessage.classList.add("is-info");
      return;
    }
    createNotice(message, submitArea);
  }

  function setSubmitButtonState(disabled, label) {
    if (!submitButton) return;
    submitButton.disabled = disabled;
    submitButton.textContent = label;
  }

  function fingerprintData(data) {
    return JSON.stringify(data);
  }

  function fillCandidateForm(profile) {
    if (!form) return;
    const data = profile || {};
    ["nome", "email", "telefone", "regiao", "area", "nivel", "cargoDesejado", "pretensaoSalarial", "disponibilidade", "modeloTrabalho", "cnh", "linkedinPortfolio", "resumo", "experiencias", "formacao", "cursosCertificacoes", "competencias", "idiomas", "valores", "curriculoArquivo"].forEach((key) => {
      const field = form.elements.namedItem(key);
      if (field) field.value = data[key] || (key === "email" ? state.currentCandidateUser?.email || "" : "");
    });
    const curriculoNome = document.getElementById("curriculoNome");
    if (curriculoNome) curriculoNome.textContent = data.curriculoArquivoNome || data.curriculoArquivo || "Nenhum currículo informado.";
    const serviceEmailField = document.querySelector('#candidateServiceForm input[name="email"]');
    if (serviceEmailField) serviceEmailField.value = data.email || state.currentCandidateUser?.email || "";
  }

  registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(registerForm).entries());
    if (`${data.senha || ""}` !== `${data.confirmarSenha || ""}`) {
      return showCandidateAuthNotice("As senhas não coincidem. Confira e tente novamente.", "error");
    }
    const button = document.getElementById("candidateRegisterBtn");
    try {
      setButtonBusy(button, "Criando acesso...", "Criar acesso", true);
      await createCandidateAccount(data);
      state.currentCandidateUser = state.mode === "cloud" && state.auth?.currentUser
        ? state.auth.currentUser
        : state.currentCandidateUser;
      await persistCandidateProfile({ nome: data.nome, email: data.email, telefone: data.telefone || "", regiao: data.regiao || "", area: data.area || "", nivel: data.nivel || "", status: "Ativo" });
      await loadCandidateProfileForCurrentUser();
      await hydrateInitialData();
      fillCandidateForm({ nome: data.nome, email: data.email });
      syncCandidateUiState();
      showCandidateAuthNotice("Dados salvos com sucesso. Conta do candidato criada e acesso liberado.");
      clearFormFields(registerForm);
    } catch (error) {
      console.error(error);
      const message = ["auth/email-already-in-use", "LOCAL_EMAIL_IN_USE"].includes(error?.code || error?.message)
        ? "Esse e-mail já possui cadastro. Faça login para entrar."
        : error?.code === "auth/weak-password"
        ? "A senha precisa ter pelo menos 6 caracteres."
        : error?.message === "AUTH_REQUIRED"
        ? "O acesso seguro depende do Firebase ativo. Verifique a configuração antes de cadastrar."
        : "Não foi possível criar o acesso agora. Tente novamente.";
      showCandidateAuthNotice(message, "error");
    } finally {
      setButtonBusy(button, "Criando acesso...", "Criar acesso", false);
    }
  });

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(loginForm).entries());
    const button = document.getElementById("candidateLoginBtn");
    try {
      setButtonBusy(button, "Entrando...", "Entrar", true);
      await loginCandidateAccount(data);
      state.currentCandidateUser = state.mode === "cloud" && state.auth?.currentUser
        ? state.auth.currentUser
        : state.currentCandidateUser;
      await loadCandidateProfileForCurrentUser();
      fillCandidateForm(state.currentCandidateProfile || { email: data.email });
      syncCandidateUiState();
      showCandidateAuthNotice("Login realizado com sucesso. Redirecionando para sua área.");
      clearFormFields(loginForm);
    } catch (error) {
      console.error(error);
      const message = error?.message === "ACCOUNT_BLOCKED"
        ? "Seu acesso está bloqueado. Fale com o suporte para regularizar o cadastro."
        : error?.code === "auth/invalid-credential"
        ? "E-mail ou senha incorretos."
        : error?.message === "AUTH_REQUIRED"
        ? "O login seguro depende do Firebase ativo. Verifique a configuração."
        : "Não foi possível entrar agora. Tente novamente.";
      showCandidateAuthNotice(message, "error");
    } finally {
      setButtonBusy(button, "Entrando...", "Entrar", false);
    }
  });

  logoutButton?.addEventListener("click", async () => {
    try {
      await logoutCandidateAccount();
      showCandidateAuthNotice("Você saiu da área do candidato.", "info");
    } catch (error) {
      console.error(error);
      showCandidateAuthNotice("Não foi possível sair agora.", "error");
    }
  });

  document.getElementById("fillCandidateDemo")?.addEventListener("click", () => {
    if (!form) return;
    const demo = {
      nome: state.currentCandidateProfile?.nome || state.currentCandidateUser?.displayName || "Maurício Silva",
      email: state.currentCandidateUser?.email || state.currentCandidateProfile?.email || "mauricio@email.com",
      telefone: "(64) 99999-9999",
      regiao: "Rio Verde - GO",
      area: "Recursos Humanos",
      nivel: "Pleno",
      cargoDesejado: "Analista de Recursos Humanos",
      pretensaoSalarial: "A combinar",
      disponibilidade: "Imediata",
      modeloTrabalho: "Presencial ou híbrido",
      cnh: "B",
      linkedinPortfolio: "linkedin.com/in/exemplo",
      resumo: "Profissional com experiência em atendimento, rotinas administrativas, organização e relacionamento interpessoal.",
      experiencias: "Empresa Exemplo — Assistente Administrativo — 2022 a 2025\nAtividades: atendimento, organização de documentos, controle de planilhas e apoio ao RH.",
      formacao: "Ensino médio completo. Cursos livres em rotinas administrativas e atendimento.",
      cursosCertificacoes: "Excel básico/intermediário; atendimento ao cliente; comunicação profissional.",
      competencias: "Pacote Office, atendimento, organização de processos, comunicação, triagem inicial.",
      idiomas: "Português nativo; inglês básico.",
      valores: "Responsabilidade, ética, compromisso, respeito e boa comunicação.",
      curriculoArquivo: "curriculo-mauricio.pdf"
    };
    fillCandidateForm(demo);
  });


async function readCandidateResumeFile(form) {
  const fileInput = form?.querySelector('input[name="curriculoArquivoFile"]');
  const file = fileInput?.files?.[0];
  if (!file) return {};
  const maxBytes = 700 * 1024;
  if (file.size > maxBytes) throw new Error('CURRICULO_FILE_TOO_LARGE');
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return { curriculoArquivoNome: file.name, curriculoArquivoTipo: file.type || 'application/octet-stream', curriculoArquivoTamanho: file.size, curriculoArquivoDataUrl: dataUrl, curriculoArquivo: file.name };
}

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.currentCandidateUser && !state.currentCandidateProfile) {
      return showCandidateMessage("Faça login para salvar seu perfil individual.", "error");
    }
    const data = Object.fromEntries(new FormData(form).entries());
    delete data.curriculoArquivoFile;
    const filePayload = await readCandidateResumeFile(form);
    Object.assign(data, filePayload);
    const fingerprint = fingerprintData({ ...data, curriculoArquivoDataUrl: data.curriculoArquivoDataUrl ? data.curriculoArquivoNome : "" });
    const now = Date.now();
    if (isSubmitting) return showCandidateMessage("Seus dados já estão sendo salvos. Aguarde um instante.", "info");
    if (fingerprint === lastSubmissionFingerprint && now - lastSubmissionAt < 15000) return showCandidateMessage("Esses dados já foram salvos agora há pouco.", "info");
    try {
      isSubmitting = true;
      if (successMessage) {
        successMessage.style.display = "none";
        successMessage.classList.remove("is-error", "is-info");
      }
      setSubmitButtonState(true, "Salvando...");
      await saveCandidate(data);
      lastSubmissionFingerprint = fingerprint;
      lastSubmissionAt = Date.now();
      await loadCandidateProfileForCurrentUser();
      clearFormFields(form);
      fillCandidateForm({ email: state.currentCandidateUser?.email || state.currentCandidateProfile?.email || "" });
      showCandidateMessage("Dados salvos com sucesso.", "success");
      clearTimeout(buttonCooldownTimer);
      setSubmitButtonState(true, "Dados salvos");
      buttonCooldownTimer = setTimeout(() => setSubmitButtonState(false, "Salvar perfil"), 4000);
    } catch (error) {
      console.error("Erro ao salvar candidato:", error);
      showCandidateMessage(error?.message === "CURRICULO_FILE_TOO_LARGE" ? "O currículo anexado está muito grande para salvar direto no Firestore. Use um PDF de até 700 KB nesta versão ou compacte o arquivo." : "Não foi possível salvar agora. Tente novamente.", "error");
      setSubmitButtonState(false, "Salvar perfil");
    } finally {
      isSubmitting = false;
    }
  });


  document.getElementById("candidateHighlightPlanCards")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-candidate-highlight-plan]");
    if (!button) return;
    if (!state.currentCandidateUser && !state.currentCandidateProfile) return createNotice("Faça login para solicitar um plano de destaque.", button.parentElement);
    try {
      setButtonBusy(button, "Enviando...", button.textContent || "Solicitar", true);
      await saveServiceRequest({
        tipo: button.dataset.planTitle || "Quero me destacar",
        serviceCode: button.dataset.candidateHighlightPlan || "",
        servicePrice: Number(button.dataset.planPrice || 0),
        origin: "candidate_highlight_plan",
        status: "Avaliação solicitada",
        paymentStatus: "Pagamento simbólico pendente",
        deliveryStatus: "Pendente",
        candidateUid: getCurrentCandidateUid(),
        email: state.currentCandidateUser?.email || state.currentCandidateProfile?.email || "",
        candidateName: state.currentCandidateProfile?.nome || state.currentCandidateUser?.displayName || "",
        mensagem: "Candidato solicitou plano Quero me destacar. Pagamento não garante validação; decisão depende da consultora."
      });
      await updateCurrentCandidateStatus("Avaliação solicitada");
      await hydrateInitialData();
      createNotice("Plano de destaque solicitado. A validação continua dependendo da análise da consultora.", button.parentElement);
    } catch (error) {
      console.error(error);
      createNotice("Não foi possível solicitar este plano agora.", button.parentElement);
    } finally {
      setButtonBusy(button, "Enviando...", button.dataset.idleLabel || "Solicitar este plano", false);
    }
  });

  const candidateServiceForm = document.getElementById("candidateServiceForm");
  candidateServiceForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.currentCandidateUser && !state.currentCandidateProfile) {
      return createNotice("Faça login para solicitar um serviço.", candidateServiceForm.parentElement);
    }
    const payload = Object.fromEntries(new FormData(candidateServiceForm).entries());
    try {
      await saveServiceRequest({
        ...payload,
        origin: "candidate",
        uid: getCurrentCandidateUid(),
        email: state.currentCandidateUser?.email || payload.email || state.currentCandidateProfile?.email || "",
        nome: state.currentCandidateProfile?.nome || state.currentCandidateUser?.displayName || "",
        status: payload.tipo?.includes("Quero me destacar") ? "Avaliação solicitada" : "Solicitado",
        paymentStatus: payload.tipo?.includes("Quero me destacar") ? "Pagamento simbólico pendente" : "Pendente"
      });
      if (payload.tipo?.includes("Quero me destacar") && (state.currentCandidateProfile || state.currentCandidateUser)) {
        await persistCandidateProfile({ ...(state.currentCandidateProfile || {}), candidateStatus: "Avaliação solicitada" });
      }
      clearFormFields(candidateServiceForm);
      const serviceEmailField = candidateServiceForm.querySelector('input[name="email"]');
      if (serviceEmailField) serviceEmailField.value = state.currentCandidateUser?.email || state.currentCandidateProfile?.email || "";
      createNotice("Dados salvos com sucesso.", candidateServiceForm.parentElement);
    } catch (error) {
      console.error(error);
      createNotice("Não foi possível enviar a solicitação agora.", candidateServiceForm.parentElement);
    }
  });

  const discForm = document.getElementById("discForm");
  discForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.currentCandidateUser && !state.currentCandidateProfile) return createNotice("Faça login para salvar o teste DISC.", discForm.parentElement);
    const formData = new FormData(discForm);
    const data = Object.fromEntries(formData.entries());
    const discResult = calculateDiscResult(formData);
    try {
      await saveFeedback({
        ...data,
        candidato: state.currentCandidateProfile?.nome || state.currentCandidateUser?.displayName || "Candidato",
        candidateEmail: state.currentCandidateUser?.email || data.candidateEmail || state.currentCandidateProfile?.email || "",
        email: state.currentCandidateUser?.email || data.candidateEmail || state.currentCandidateProfile?.email || "",
        tipo: "Teste DISC",
        status: "DISC profissional preenchido",
        perfilDisc: discResult.profileName,
        dominantTrait: discResult.dominant,
        secondaryTrait: discResult.secondary,
        dominanciaPercent: discResult.percentages.D,
        influenciaPercent: discResult.percentages.I,
        estabilidadePercent: discResult.percentages.S,
        conformidadePercent: discResult.percentages.C,
        rawScores: JSON.stringify(discResult.raw),
        percentages: discResult.percentages,
        resultado: `D: ${discResult.percentages.D}% | I: ${discResult.percentages.I}% | S: ${discResult.percentages.S}% | C: ${discResult.percentages.C}%`,
        interpretacaoResumo: discResult.interpretation.resumo,
        pontosFortes: discResult.interpretation.pontosFortes,
        pontosAtencao: discResult.interpretation.pontosAtencao,
        ambienteIdeal: discResult.interpretation.ambienteIdeal,
        leituraTecnica: discResult.interpretation.leituraTecnica,
        parecer: `${discResult.interpretation.resumo} Pontos fortes: ${discResult.interpretation.pontosFortes} | Atenção: ${discResult.interpretation.pontosAtencao}`
      });
      clearFormFields(discForm);
      renderDiscQuestionnaire();
      const emailField = discForm.querySelector('input[name="candidateEmail"]');
      if (emailField) emailField.value = state.currentCandidateUser?.email || state.currentCandidateProfile?.email || "";
      createNotice("Teste DISC profissional salvo com gráfico percentual.", discForm.parentElement);
      renderCandidateTests();
    } catch (error) {
      console.error(error);
      createNotice("Não foi possível salvar o teste DISC agora.", discForm.parentElement);
    }
  });

  
  document.getElementById("candidateHighlightFab")?.addEventListener("click", (event) => {
    event.preventDefault();
    document.querySelector('[data-tab="servicos"]')?.click();
    document.getElementById("tab-servicos")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  if (state.mode === "local") {
    state.currentCandidateUser = null;
    state.currentCandidateProfile = null;
    syncCandidateUiState();
  }
}

function initJobPage() {
  if (!isCompanyPage()) return;
  document.getElementById("candidateCards")?.addEventListener("click", async (event) => {
    const serviceButton = event.target.closest("[data-company-candidate-service]");
    if (serviceButton) {
      if (!state.currentCompanyUser && !state.currentCompanyProfile) return showCompanyAuthNotice("Faca login para contratar um servico vinculado ao candidato.", "error");
      const serviceCode = serviceButton.dataset.companyCandidateService || "";
      const catalogService = getCatalogItemByCode(serviceCode) || getCatalogItemsByType("service").find((item) => item.title === serviceButton.dataset.serviceTitle) || null;
      if (!catalogService) return showCompanyAuthNotice("Servico nao encontrado para iniciar a contratacao.", "error");
      try {
        setButtonBusy(serviceButton, "Preparando pagamento...", serviceButton.textContent || "Contratar", true);
        const result = await startProfessionalCheckout(catalogService, {
          serviceContext: {
            candidateId: serviceButton.dataset.candidateId || "",
            candidateName: serviceButton.dataset.candidateName || "",
            candidateEmail: serviceButton.dataset.candidateEmail || "",
            message: `Servico contratado dentro do curriculo do candidato ${serviceButton.dataset.candidateName || ""}. Toda execucao deve passar pela consultora.`
          }
        });
        await hydrateInitialData();
        if (!result?.redirected) {
          showCompanyAuthNotice("Pagamento do servico iniciado. A solicitacao sera liberada apos confirmacao do Asaas.");
          document.querySelector('[data-tab="contato"]')?.click();
        }
      } catch (error) {
        console.error(error);
        showCompanyAuthNotice("Nao foi possivel iniciar o pagamento do servico agora.", "error");
      } finally {
        setButtonBusy(serviceButton, "Preparando pagamento...", serviceButton.dataset.idleLabel || "Contratar para este candidato", false);
      }
    }
  });
  const loginForm = document.getElementById("companyLoginForm");
  const registerForm = document.getElementById("companyRegisterForm");
  const logoutButton = document.getElementById("companyLogoutBtn");
  registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(registerForm).entries());
    if (`${data.senha||""}` !== `${data.confirmarSenha||""}`) return showCompanyAuthNotice("As senhas não coincidem.", "error");
    const button = document.getElementById("companyRegisterBtn");
    try {
      setButtonBusy(button, "Criando acesso...", "Criar acesso empresarial", true);
      await createCompanyAccount(data);
      state.currentCompanyUser = state.mode === "cloud" && state.auth?.currentUser
        ? state.auth.currentUser
        : state.currentCompanyUser;
      await persistCompanyProfile({ empresa: data.empresa, email: data.email, login: data.login, telefone: data.telefone, cnpj: data.cnpj, planName: "", planActive: false, paymentStatus: "Pendente", status: "Pendente" });
      await loadCompanyProfileForCurrentUser();
      await hydrateInitialData();
      syncCompanyUiState();
      showCompanyAuthNotice("Dados salvos com sucesso. Conta empresarial criada e acesso liberado.");
      clearFormFields(registerForm);
    } catch (error) {
      console.error(error);
      showCompanyAuthNotice(["auth/email-already-in-use", "LOCAL_EMAIL_IN_USE"].includes(error?.code || error?.message) ? "Esse e-mail já possui cadastro." : "Não foi possível criar a conta da empresa.", "error");
    } finally {
      setButtonBusy(button, "Criando acesso...", "Criar acesso empresarial", false);
    }
  });
  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(loginForm).entries());
    const button = document.getElementById("companyLoginBtn");
    try {
      setButtonBusy(button, "Entrando...", "Entrar", true);
      await loginCompanyAccount(data);
      state.currentCompanyUser = state.mode === "cloud" && state.auth?.currentUser
        ? state.auth.currentUser
        : state.currentCompanyUser;
      await loadCompanyProfileForCurrentUser();
      syncCompanyUiState();
      showCompanyAuthNotice("Login realizado com sucesso. Redirecionando para a área da empresa.");
      clearFormFields(loginForm);
    } catch (error) {
      console.error(error);
      const message = error?.message === "ACCOUNT_BLOCKED"
        ? "O acesso da empresa está bloqueado. Fale com o suporte para regularizar o cadastro."
        : error?.message === "AUTH_REQUIRED"
        ? "O login seguro da empresa depende do Firebase ativo. Verifique a configuração."
        : "E-mail ou senha incorretos.";
      showCompanyAuthNotice(message, "error");
    } finally {
      setButtonBusy(button, "Entrando...", "Entrar", false);
    }
  });
  logoutButton?.addEventListener("click", async () => {
    try {
      await logoutCompanyAccount();
      showCompanyAuthNotice("Você saiu da área da empresa.", "info");
    } catch (error) {
      console.error(error);
      showCompanyAuthNotice("Não foi possível sair agora.", "error");
    }
  });
  document.addEventListener("click", async (event) => {
    const serviceButton = event.target.closest("[data-service-contract]");
    if (serviceButton && isCompanyPage()) {
      if (serviceButton.disabled) return;
      if (!state.currentCompanyUser && !state.currentCompanyProfile) return showCompanyAuthNotice("Faca login para contratar um servico.", "error");
      const serviceCode = serviceButton.dataset.serviceContract || "";
      const catalogService = getCatalogItemByCode(serviceCode) || null;
      if (!catalogService) return showCompanyAuthNotice("Servico nao encontrado para iniciar a contratacao.", "error");
      try {
        setButtonBusy(serviceButton, "Preparando pagamento...", serviceButton.textContent || "Contratar Serviço", true);
        const result = await startProfessionalCheckout(catalogService, {
          serviceContext: {
            message: `Servico avulso contratado pela empresa: ${catalogService.title || serviceCode}.`
          }
        });
        await hydrateInitialData();
        syncCompanyUiState();
        if (!result?.redirected) {
          showCompanyAuthNotice("Pagamento do servico iniciado. A solicitacao sera liberada apos confirmacao do Asaas.");
        }
      } catch (error) {
        console.error(error);
        await hydrateInitialData();
        syncCompanyUiState();
        showCompanyAuthNotice("Nao foi possivel iniciar o pagamento do servico agora.", "error");
      } finally {
        setButtonBusy(serviceButton, "Preparando pagamento...", serviceButton.dataset.idleLabel || "Contratar Serviço", false);
      }
      return;
    }
    const button = event.target.closest("[data-plan-contract]");
    if (!button || !isCompanyPage()) return;
    if (button.disabled) return;
    if (!state.currentCompanyUser && !state.currentCompanyProfile) return showCompanyAuthNotice("Faça login para contratar um plano.", "error");
    const code = button.dataset.planContract || "";
    const catalogPlan = getCatalogItemByCode(code) || getCatalogItemsByType("plan").find((item) => item.title === code) || null;
    if (!catalogPlan) return showCompanyAuthNotice("Plano não encontrado para iniciar a contratação.", "error");
    try {
      setButtonBusy(button, "Preparando pagamento...", button.textContent || "Contratar Plano", true);
      const result = await startProfessionalCheckout(catalogPlan);
      await hydrateInitialData();
      syncCompanyUiState();
      if (!result?.redirected) {
        showCompanyAuthNotice(`Solicitação do ${catalogPlan.title} registrada com status pendente. Assim que o pagamento for confirmado pelo Asaas, o acesso será liberado.`);
      }
    } catch (error) {
      console.error(error);
      await hydrateInitialData();
      syncCompanyUiState();
      showCompanyAuthNotice("Não foi possível abrir o pagamento seguro agora. Tente novamente em instantes ou fale com o suporte.", "error");
    } finally {
      setButtonBusy(button, "Preparando pagamento...", button.dataset.idleLabel || "Contratar Plano", false);
    }
  });
  const form = document.getElementById("jobForm");

async function readCandidateResumeFile(form) {
  const fileInput = form?.querySelector('input[name="curriculoArquivoFile"]');
  const file = fileInput?.files?.[0];
  if (!file) return {};
  const maxBytes = 700 * 1024;
  if (file.size > maxBytes) throw new Error('CURRICULO_FILE_TOO_LARGE');
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return { curriculoArquivoNome: file.name, curriculoArquivoTipo: file.type || 'application/octet-stream', curriculoArquivoTamanho: file.size, curriculoArquivoDataUrl: dataUrl, curriculoArquivo: file.name };
}

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const button = form.querySelector('button[type="submit"]');
    try {
      setButtonBusy(button, "Salvando...", button?.textContent || "Salvar vaga", true);
      await saveJob(data);
      clearFormFields(form);
      createNotice("Dados salvos com sucesso.", form.parentElement);
    } catch (error) { console.error(error); createNotice("Não foi possível cadastrar a vaga agora.", form.parentElement); }
    finally { setButtonBusy(button, "Salvando...", button?.dataset?.idleLabel || "Salvar vaga", false); }
  });
  const companyRequestForm = document.getElementById("companyRequestForm");
  companyRequestForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.currentCompanyUser && !state.currentCompanyProfile) return createNotice("Faça login para contratar um serviço.", companyRequestForm.parentElement);
    const data = Object.fromEntries(new FormData(companyRequestForm).entries());
    const button = companyRequestForm.querySelector('button[type="submit"]');
    try {
      setButtonBusy(button, "Salvando...", button?.textContent || "Contratar serviço", true);
      const selectedService = getCatalogItemsByType("service").find((item) => item.title === data.tipo) || null;
      await saveServiceRequest({ ...data, serviceCode: selectedService?.code || "", servicePrice: Number(selectedService?.price || 0), serviceGateway: selectedService?.gateway || "Faturamento manual", origin: "company", status: "Contratado", deliveryStatus: "Contratado", companyUid: getCurrentCompanyUid(), contactEmail: getCurrentCompanyEmail() });
      clearFormFields(companyRequestForm);
      showCompanyAuthNotice("Dados salvos com sucesso. Serviço enviado para a fila da consultora.");
    } catch (error) { console.error(error); createNotice("Não foi possível enviar a solicitação agora.", companyRequestForm.parentElement); }
    finally { setButtonBusy(button, "Salvando...", button?.dataset?.idleLabel || "Contratar serviço", false); }
  });
  document.getElementById("companyCandidateSearch")?.addEventListener("input", (event) => { state.companyCandidateFilters.search = event.target.value || ""; renderCandidateViews(state.candidates); });
  document.getElementById("companyCandidateAreaFilter")?.addEventListener("input", (event) => { state.companyCandidateFilters.area = event.target.value || ""; renderCandidateViews(state.candidates); });
  document.getElementById("companyCandidateRegionFilter")?.addEventListener("input", (event) => { state.companyCandidateFilters.region = event.target.value || ""; renderCandidateViews(state.candidates); });
  if (state.mode === "local") {
    state.currentCompanyUser = null;
    state.currentCompanyProfile = null;
    syncCompanyUiState();
  }
}

async function updateCandidateDecision(candidateId, decision) {
  if (!candidateId) throw new Error("CANDIDATE_ID_REQUIRED");
  const current = state.candidates.find((item) => `${item.id || item.uid || ""}` === `${candidateId}`) || {};
  const payload = {
    candidateStatus: decision,
    validated: decision === "Validado pela consultora",
    seloConduzir: decision === "Validado pela consultora",
    decisionBy: state.currentSystemUser?.nome || state.currentSystemUser?.login || "Consultora",
    decisionAt: state.mode === "cloud" ? serverTimestamp() : new Date().toLocaleString("pt-BR")
  };
  await updateRecord("candidates", candidateId, payload);
  if (current.email) {
    await saveFeedback({
      candidato: current.nome || "Candidato",
      candidateEmail: current.email,
      email: current.email,
      status: decision,
      resultado: decision === "Validado pela consultora" ? "Perfil aprovado e liberado para empresas" : decision,
      tipo: "Decisão da consultora",
      parecer: decision === "Validado pela consultora" ? "Candidato aprovado pela consultoria e liberado com selo Validado pela Conduzir." : "Status atualizado pela consultora no painel técnico."
    });
  }
  await hydrateInitialData();
}

function prefillCompanyServiceFromCandidate(action, name, email) {
  const typeField = document.getElementById("companyServiceType");
  const form = document.getElementById("companyRequestForm");
  if (!form) return;
  if (typeField) {
    const existing = [...typeField.options].find((opt) => opt.value === action || opt.textContent === action);
    if (existing) typeField.value = existing.value;
  }
  const empresa = form.querySelector('[name="empresa"]');
  const responsavel = form.querySelector('[name="responsavel"]');
  const contato = form.querySelector('[name="contato"]');
  const mensagem = form.querySelector('[name="mensagem"]');
  if (empresa && state.currentCompanyProfile?.empresa) empresa.value = state.currentCompanyProfile.empresa;
  if (responsavel && !responsavel.value) responsavel.value = state.currentCompanyProfile?.responsavel || state.currentCompanyUser?.displayName || "";
  if (contato && !contato.value) contato.value = state.currentCompanyProfile?.email || state.currentCompanyUser?.email || "";
  if (mensagem) mensagem.value = `${action} para o candidato ${name}${email ? ` (${email})` : ""}. Toda comunicação deve passar pela consultora.`;
  document.querySelector('[data-tab="contato"]')?.click();
  createNotice("Solicitação preparada. Confira os dados e clique em Contratar serviço para enviar à consultora.", form.parentElement);
}

function initFeedbackPage() {
  document.getElementById("consultantCandidates")?.addEventListener("click", async (event) => {
    const scheduleButton = event.target.closest("[data-schedule-interview]");
    if (scheduleButton) {
      const candidate = state.candidates.find((item) => `${item.id || item.uid || ""}` === `${scheduleButton.dataset.candidateId || ""}`);
      fillConsultantInterviewFormFromCandidate(candidate);
      return;
    }
    const button = event.target.closest("[data-candidate-action]");
    if (!button) return;
    try {
      setButtonBusy(button, "Salvando...", button.textContent, true);
      await updateCandidateDecision(button.dataset.candidateId, button.dataset.candidateAction);
      createNotice("Status do candidato atualizado com sucesso.", document.getElementById("consultantCandidates")?.parentElement);
    } catch (error) {
      console.error(error);
      createNotice("Não foi possível atualizar o candidato agora.", document.getElementById("consultantCandidates")?.parentElement);
    } finally {
      setButtonBusy(button, "Salvando...", button.dataset.idleLabel || button.textContent, false);
    }
  });
  const consultantLoginForm = document.getElementById("systemLoginForm-consultora");
  consultantLoginForm?.addEventListener("submit", async (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(consultantLoginForm).entries()); const button = consultantLoginForm.querySelector('button[type="submit"]'); try { setButtonBusy(button, "Entrando...", button?.textContent || "Entrar", true); await loginSystemUser("Consultora", data); clearFormFields(consultantLoginForm); showSystemAuthNotice("Consultora", "Login realizado com sucesso. Redirecionando para a área da consultora."); } catch (error) { showSystemAuthNotice("Consultora", "Login ou senha inválidos.", "error"); } finally { setButtonBusy(button, "Entrando...", button?.dataset?.idleLabel || "Entrar", false); } });
  document.getElementById("systemLogoutBtn-consultora")?.addEventListener("click", async () => { await logoutSystemUser("Consultora"); showSystemAuthNotice("Consultora", "Você saiu da área da consultora.", "info"); });
  const deliveryForm = document.getElementById("serviceDeliveryForm");
  deliveryForm?.addEventListener("submit", async (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(deliveryForm).entries()); const button = deliveryForm.querySelector('button[type="submit"]'); try { setButtonBusy(button, "Salvando...", button?.textContent || "Salvar", true); await updateRecord("serviceRequests", data.requestId, { deliveryStatus: data.deliveryStatus, deliveryMessage: data.deliveryMessage, deliveredBy: state.currentSystemUser?.nome || state.currentSystemUser?.login || "Consultora" }); clearFormFields(deliveryForm); createNotice("Dados salvos com sucesso.", deliveryForm.parentElement); } catch (error) { console.error(error); createNotice("Não foi possível atualizar o serviço agora.", deliveryForm.parentElement); } finally { setButtonBusy(button, "Salvando...", button?.dataset?.idleLabel || "Salvar", false); } });
  const form = document.getElementById("feedbackForm");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await saveFeedback({ ...data, email: data.candidateEmail || data.email || "" });
      const candidateEmail = `${data.candidateEmail || data.email || ""}`.toLowerCase();
      const candidate = state.candidates.find((item) => `${item.email || ""}`.toLowerCase() === candidateEmail);
      if (candidate?.id || candidate?.uid) {
        const candidateId = candidate.id || candidate.uid;
        if (data.seloConduzir === "true" || data.status === "Validado pela consultora") {
          await updateCandidateDecision(candidateId, "Validado pela consultora");
        } else if (data.status === "Avaliação DISC solicitada") {
          await updateCandidateDecision(candidateId, "Em avaliação");
          await saveServiceRequest({
            origin: "candidate",
            tipo: "Teste DISC comportamental",
            status: "DISC solicitado pela consultora",
            email: candidate.email || candidateEmail,
            nome: candidate.nome || data.candidato || "Candidato",
            uid: candidate.uid || candidate.id || "",
            mensagem: "Consultora solicitou preenchimento do teste DISC comportamental."
          });
        }
      }
      form.reset();
      createNotice(state.mode === "cloud" ? "Parecer salvo com sucesso na nuvem." : "Parecer salvo com sucesso.", form.parentElement);
    } catch (error) {
      console.error("Erro ao salvar parecer:", error);
      createNotice("Não foi possível salvar o parecer agora. Confira o Firebase.", form.parentElement);
    }
  });

  const noteForm = document.getElementById("internalNoteForm");
  noteForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(noteForm).entries());
    try {
      await saveInternalNote(data);
      noteForm.reset();
      createNotice("Anotação interna salva com sucesso.", noteForm.parentElement);
    } catch (error) {
      console.error(error);
      createNotice("Não foi possível salvar a anotação agora.", noteForm.parentElement);
    }
  });

  const interviewForm = document.getElementById("interviewForm");
  interviewForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(interviewForm).entries());
    const button = interviewForm.querySelector('button[type="submit"]');
    const interviewId = `${data.interviewId || ""}`.trim();
    try {
      setButtonBusy(button, "Salvando...", button?.textContent || "Salvar entrevista", true);
      const payload = buildInterviewPayload(data);
      delete payload.interviewId;
      if (!payload.email && !payload.uid) {
        createNotice("Informe o e-mail do candidato ou agende usando o botão do card do candidato para a entrevista aparecer para ele.", interviewForm.parentElement, "error");
        return;
      }
      if (interviewId) {
        await updateRecord("interviews", interviewId, { ...payload, status: payload.status === "Reagendar" ? "Reagendada" : payload.status });
        if (state.mode === "local") renderInterviews(state.interviews);
        createNotice("Entrevista reagendada e atualizada para o candidato.", interviewForm.parentElement);
      } else {
        await saveInterview(payload);
        createNotice("Entrevista registrada com sucesso. Ela já aparece na aba Entrevistas Agendadas do candidato.", interviewForm.parentElement);
      }
      interviewForm.reset();
    } catch (error) {
      console.error(error);
      createNotice("Não foi possível salvar a entrevista agora.", interviewForm.parentElement);
    } finally {
      setButtonBusy(button, "Salvando...", button?.dataset?.idleLabel || "Salvar entrevista", false);
    }
  });

  document.getElementById("interviewTableBody")?.addEventListener("click", async (event) => {
    const rescheduleButton = event.target.closest("[data-interview-reschedule]");
    const statusButton = event.target.closest("[data-interview-status]");
    const button = rescheduleButton || statusButton;
    if (!button) return;
    const id = button.dataset.interviewId || "";
    const interview = state.interviews.find((item) => `${item.id || ""}` === `${id}`);
    if (!interview) return;
    if (rescheduleButton) {
      fillConsultantInterviewFormForReschedule(interview);
      return;
    }
    try {
      setButtonBusy(button, "Salvando...", button.textContent, true);
      await updateRecord("interviews", id, { status: button.dataset.interviewStatus });
      if (state.mode === "local") renderInterviews(state.interviews);
      createNotice(button.dataset.interviewStatus === "Realizada" ? "Entrevista marcada como realizada." : "Situação da entrevista atualizada com sucesso.", document.getElementById("interviewForm")?.parentElement);
    } catch (error) {
      console.error(error);
      createNotice("Não foi possível atualizar a situação da entrevista.", document.getElementById("interviewForm")?.parentElement);
    } finally {
      setButtonBusy(button, "Salvando...", button.dataset.idleLabel || button.textContent, false);
    }
  });
}

function showAdminUserNotice(message, type = "success") {
  const host = document.getElementById("adminUserNoticeHost");
  if (!host) return;
  host.innerHTML = `<div class="inline-success ${type === "error" ? "is-error" : type === "info" ? "is-info" : ""}">${message}</div>`;
  setTimeout(() => {
    if (host.firstElementChild?.textContent === message) host.innerHTML = "";
  }, 4000);
}

function clearAdminUserForm() {
  const form = document.getElementById("adminUserForm");
  if (!form) return;
  const profileSelect = document.getElementById("adminUserPerfil");
  if (profileSelect) { profileSelect.value = "Consultora"; }
  form.reset();
  state.adminUserEditId = null;
  document.getElementById("adminUserId") && (document.getElementById("adminUserId").value = "");
  document.getElementById("adminUserCurrentPassword") && (document.getElementById("adminUserCurrentPassword").value = "");
  document.getElementById("adminUserEmail") && (document.getElementById("adminUserEmail").value = "");
  const passwordField = document.getElementById("adminUserSenha");
  if (passwordField) { passwordField.value = ""; passwordField.placeholder = "Digite a senha"; }
  document.getElementById("adminUserFormTitle") && (document.getElementById("adminUserFormTitle").textContent = "Adicionar novo usuário");
  document.getElementById("adminUserSubmitBtn") && (document.getElementById("adminUserSubmitBtn").textContent = "Salvar usuário");
  const perfilField = document.getElementById("adminUserPerfil"); if (perfilField) perfilField.value = "Consultora";
  document.getElementById("adminUserNome")?.focus();
}

function fillAdminUserForm(user) {
  if (!user) return;
  state.adminUserEditId = user.id;
  document.getElementById("adminUserId").value = user.id || "";
  document.getElementById("adminUserNome").value = user.nome || "";
  document.getElementById("adminUserLogin").value = user.login || "";
  document.getElementById("adminUserEmail") && (document.getElementById("adminUserEmail").value = user.email || "");
  document.getElementById("adminUserCurrentPassword") && (document.getElementById("adminUserCurrentPassword").value = "");
  const passwordField = document.getElementById("adminUserSenha");
  if (passwordField) { passwordField.value = ""; passwordField.placeholder = "Preencha somente para novo usuário"; }
  document.getElementById("adminUserPerfil").value = user.perfil || "Consultora";
  document.getElementById("adminUserStatus").value = user.status || "Ativo";
  document.getElementById("adminUserContato").value = user.contato || "";
  document.getElementById("adminUserObservacoes").value = user.observacoes || "";
  document.getElementById("adminUserFormTitle") && (document.getElementById("adminUserFormTitle").textContent = `Editando usuário: ${user.nome || user.login || "Sem nome"}`);
  document.getElementById("adminUserSubmitBtn") && (document.getElementById("adminUserSubmitBtn").textContent = "Salvar alterações");
  document.querySelector('[data-tab="perfis"]')?.click();
}

function initAdminUserManagement() {
  const bootstrapArea = document.getElementById("adminBootstrapArea");
  if (bootstrapArea) bootstrapArea.classList.toggle("is-hidden", state.systemUsers.some((item) => isMasterAdminRecord(item)));
  document.getElementById("adminBootstrapForm")?.addEventListener("submit", async (event) => { event.preventDefault(); const payload = Object.fromEntries(new FormData(event.target).entries()); try { await maybeCreateFirstAdmin(payload); createNotice("Administrador mestre criado com sucesso. Use o login fixo informado na tela para entrar.", event.target.parentElement); event.target.reset(); await hydrateInitialData(); bootstrapArea?.classList.add("is-hidden"); } catch (error) { console.error(error); createNotice(error.message === "ADMIN_ALREADY_EXISTS"
        ? "O administrador mestre já existe. Entre com o acesso fixo definido."
        : error.message === "AUTH_REQUIRED"
          ? "O Firebase Auth precisa estar ativo para criar o administrador mestre."
          : "Não foi possível criar o administrador mestre agora.", event.target.parentElement); } });
  document.getElementById("systemLoginForm-admin")?.addEventListener("submit", async (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target).entries()); try { await loginSystemUser("Administrador", data); showSystemAuthNotice("Administrador", "Login realizado com sucesso."); } catch (error) { showSystemAuthNotice("Administrador", "Use somente o administrador mestre fixo do sistema. Se for o primeiro acesso, crie esse administrador no bloco acima.", "error"); } });
  document.getElementById("systemLogoutBtn-admin")?.addEventListener("click", async () => { await logoutSystemUser("Administrador"); showSystemAuthNotice("Administrador", "Você saiu da área administrativa.", "info"); });
  const form = document.getElementById("adminUserForm");
  if (!form) return;
  const profileSelect = document.getElementById("adminUserPerfil");
  if (profileSelect) { profileSelect.value = "Consultora"; }
  document.getElementById("adminUserSearch")?.addEventListener("input", (event) => {
    state.adminUserSearchTerm = event.target.value || "";
    renderSystemUsers(state.systemUsers);
  });
  document.getElementById("adminManagementSearch")?.addEventListener("input", (event) => {
    state.adminManagementSearchTerm = event.target.value || "";
    renderAdminManagedAccounts();
  });
  document.querySelectorAll("[data-management-scope]").forEach((button) => button.addEventListener("click", () => {
    state.adminManagementScope = button.dataset.managementScope || "consultoras";
    renderAdminManagedAccounts();
  }));
  document.getElementById("adminUserCancelEditBtn")?.addEventListener("click", () => {
    clearAdminUserForm();
    showAdminUserNotice("Formulário limpo. Você pode cadastrar um novo usuário.", "info");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = document.getElementById("adminUserSubmitBtn");
    if (submitButton?.disabled) return;
    const payload = Object.fromEntries(new FormData(form).entries());
    const userId = payload.userId || state.adminUserEditId || "";
    delete payload.userId;
    delete payload.currentPassword;
    ["nome", "login", "email", "senha", "contato", "observacoes"].forEach((key) => payload[key] = `${payload[key] || ""}`.trim());
    payload.login = normalizeSystemLogin(payload.login);
    payload.nome = payload.nome || payload.login;
    if (!payload.login || !payload.perfil || !payload.status || (!userId && !payload.senha)) {
      return showAdminUserNotice("Preencha usuário e senha para criar a consultora.", "error");
    }
    if (!userId && payload.senha.length < 6) {
      return showAdminUserNotice("A senha da consultora precisa ter pelo menos 6 caracteres.", "error");
    }
    try {
      const editingUser = userId ? state.systemUsers.find((item) => item.id === userId) : null;
      if (!editingUser || !isMasterAdminRecord(editingUser)) payload.perfil = "Consultora";
      setButtonBusy(submitButton, userId ? "Salvando alterações..." : "Criando consultora...", userId ? "Salvar alterações" : "Salvar usuário", true);
      if (userId) {
        await updateSystemUserRecord(userId, payload);
        showAdminUserNotice("Consultora atualizada com sucesso.", "success");
      } else {
        await saveSystemUser(payload);
        showAdminUserNotice("Consultora criada com sucesso.", "success");
      }
      clearAdminUserForm();
    } catch (error) {
      console.error(error);
      const errorMessage = error.message === "LOGIN_EXISTS"
        ? "Já existe outra consultora com esse usuário. Use um usuário diferente."
        : error.message === "EMAIL_EXISTS"
          ? "Esse usuário técnico já existe. Troque o nome de usuário da consultora."
          : error.message === "LOGIN_AND_PASSWORD_REQUIRED" || error.message === "EMAIL_AND_PASSWORD_REQUIRED"
            ? "Informe usuário e senha para criar o acesso da consultora."
            : error.message === "AUTH_REQUIRED"
              ? "O Firebase Auth precisa estar ativo para criar acessos seguros."
              : error.message === "MASTER_ADMIN_EXISTS"
                ? "O sistema aceita somente um administrador mestre. Cadastre consultoras abaixo e use o acesso fixo do admin para entrar."
                : error?.code === "auth/weak-password"
                  ? "A senha da consultora precisa ter pelo menos 6 caracteres."
                  : "Não foi possível salvar a consultora agora. Confira o usuário e a senha.";
      showAdminUserNotice(errorMessage, "error");
    } finally {
      setButtonBusy(submitButton, userId ? "Salvando alterações..." : "Criando consultora...", state.adminUserEditId ? "Salvar alterações" : "Salvar usuário", false);
    }
  });

  document.getElementById("adminManagedAccountsList")?.addEventListener("click", async (event) => {
    const recordButton = event.target.closest("[data-record-action]");
    if (recordButton) {
      const scope = recordButton.dataset.recordScope;
      const recordId = recordButton.dataset.recordId;
      const action = recordButton.dataset.recordAction;
      const record = scope === "candidatos" ? state.candidates.find((item) => item.id === recordId) : state.companies.find((item) => item.id === recordId);
      if (!record) return showAdminUserNotice("Cadastro não encontrado para esta ação.", "error");
      try {
        if (action === "edit") {
          const ok = await promptEditManagedRecord(scope, record);
          if (ok) showAdminUserNotice("Cadastro atualizado com sucesso.");
        } else if (action === "toggle-status") {
          const nextStatus = scope === "candidatos" ? await toggleCandidateRecordStatus(record) : await toggleCompanyRecordStatus(record);
          showAdminUserNotice(nextStatus === "Bloqueado" ? "Acesso bloqueado com sucesso." : "Acesso liberado com sucesso.");
        } else if (action === "reset-password") {
          await sendSystemUserReset(record);
          showAdminUserNotice(`E-mail de redefinição enviado para ${record.email}.`, "info");
        } else if (action === "delete") {
          if (!window.confirm(`Deseja realmente excluir ${scope === "candidatos" ? (record.nome || record.email || "este candidato") : (record.empresa || record.email || "esta empresa")}?`)) return;
          if (scope === "candidatos") await softDeleteCandidateRecord(record);
          else await softDeleteCompanyRecord(record);
          showAdminUserNotice("Cadastro marcado como excluído com sucesso.");
        }
        await hydrateInitialData();
      } catch (error) {
        console.error(error);
        showAdminUserNotice("Não foi possível concluir essa ação agora.", "error");
      }
      return;
    }

    const button = event.target.closest("[data-user-action]");
    if (!button) return;
    const action = button.dataset.userAction;
    const userId = button.dataset.userId;
    const user = state.systemUsers.find((item) => item.id === userId);
    if (!user) return showAdminUserNotice("Usuário não encontrado para esta ação.", "error");
    if (action === "edit") {
      fillAdminUserForm(user);
      return;
    }
    if (action === "toggle-status") {
      try {
        const nextStatus = await toggleSystemUserStatus(user);
        showAdminUserNotice(nextStatus === "Bloqueado" ? "Acesso bloqueado com sucesso." : "Acesso liberado com sucesso.");
      } catch (error) {
        console.error(error);
        showAdminUserNotice("Não foi possível alterar o status agora.", "error");
      }
      return;
    }
    if (action === "reset-password") {
      try {
        await sendSystemUserReset(user);
        showAdminUserNotice(`E-mail de redefinição enviado para ${user.email}.`, "info");
      } catch (error) {
        console.error(error);
        showAdminUserNotice("Não foi possível enviar a redefinição de senha agora.", "error");
      }
      return;
    }
    if (action === "delete") {
      if (!window.confirm(`Deseja realmente excluir o usuário ${user.nome || user.login || "selecionado"}?`)) return;
      try {
        await deleteSystemUserRecord(userId);
        if (state.adminUserEditId === userId) clearAdminUserForm();
        showAdminUserNotice("Usuário excluído com sucesso.");
      } catch (error) {
        console.error(error);
        showAdminUserNotice("Não foi possível excluir esse usuário agora.", "error");
      }
    }
  });
}

function initAdminActions() {
  const button = document.getElementById("clearLocalData");
  if (!button) return;
  button.addEventListener("click", () => {
    Object.values(KEYS).forEach((key) => localStore.remove(key));
    fallbackCandidateRender();
    fallbackJobRender();
    fallbackFeedbackRender();
    fallbackSystemUsersRender();
    fallbackServiceRequestRender();
    fallbackInterviewRender();
    fallbackInternalNotesRender();
    fallbackCatalogItemsRender();
    fallbackBillingSettingsRender();
    fallbackPaymentSessionsRender();
    clearAdminUserForm();
    createNotice("Dados locais removidos com sucesso.", button.parentElement);
  });
}


function initInternalNotesAdminActions() {
  if (!isAdminPage()) return;
  const list = document.getElementById("internalNotesList");
  if (!list) return;
  list.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-internal-note-action]");
    if (!button) return;
    const action = button.dataset.internalNoteAction;
    const noteId = button.dataset.internalNoteId;
    const note = state.internalNotes.find((item) => item.id === noteId);
    if (!note) {
      createNotice("Mensagem não encontrada para esta ação.", list.parentElement);
      return;
    }

    if (action === "reply") {
      const currentReply = note.respostaAdmin || "";
      const resposta = window.prompt("Digite a resposta da administração para a consultora:", currentReply);
      if (resposta === null) return;
      const respostaLimpa = resposta.trim();
      if (!respostaLimpa) {
        createNotice("Digite uma resposta antes de salvar.", list.parentElement);
        return;
      }

      try {
        setButtonBusy(button, "Salvando...", button.textContent || "Responder", true);
        await updateRecord("internalNotes", noteId, {
          respostaAdmin: respostaLimpa,
          status: "Respondida",
          respondedAt: new Date().toLocaleString("pt-BR"),
          respondedBy: state.currentSystemUser?.nome || state.currentSystemUser?.login || "Administração"
        });
        await hydrateInitialData();
        createNotice("Resposta salva com sucesso.", list.parentElement);
      } catch (error) {
        console.error(error);
        createNotice("Não foi possível salvar a resposta agora.", list.parentElement);
      } finally {
        setButtonBusy(button, "Salvando...", note.respostaAdmin ? "Editar resposta" : "Responder", false);
      }
      return;
    }

    if (action === "delete") {
      if (!window.confirm("Deseja realmente excluir esta mensagem da consultora?")) return;
      try {
        setButtonBusy(button, "Excluindo...", "Excluir", true);
        await deleteRecord("internalNotes", noteId);
        await hydrateInitialData();
        createNotice("Mensagem excluída com sucesso.", list.parentElement);
      } catch (error) {
        console.error(error);
        createNotice("Não foi possível excluir a mensagem agora.", list.parentElement);
      } finally {
        setButtonBusy(button, "Excluindo...", "Excluir", false);
      }
    }
  });
}

async function hydrateInitialData() {
  try {
    const [candidates, jobs, feedbacks, systemUsers, serviceRequests, interviews, internalNotes, companies, catalogItems, billingSettings, paymentSessions] = await Promise.all([
      fetchCollection("candidates", []),
      fetchCollection("jobs", defaultJobs),
      fetchCollection("feedbacks", []),
      fetchCollection("systemUsers", []),
      fetchCollection("serviceRequests", []),
      fetchCollection("interviews", []),
      fetchCollection("internalNotes", []),
      fetchCollection("companies", []),
      fetchCollection("catalogItems", defaultCatalogItems),
      fetchCollection("billingSettings", defaultBillingSettings),
      fetchCollection("paymentSessions", [])
    ]);
    renderCandidateViews(candidates);
    renderJobs(jobs.length ? jobs : defaultJobs);
    renderFeedbacks(feedbacks);
    renderSystemUsers(systemUsers);
    renderServiceRequests(serviceRequests);
    renderInterviews(interviews);
    renderInternalNotes(internalNotes);
    state.companies = companies;
    renderAdminRegistrations();
    renderCatalogItems(catalogItems);
    renderBillingSettings(billingSettings);
    renderPaymentSessions(paymentSessions);
  } catch (error) {
    console.error("Erro ao carregar dados iniciais:", error);
    fallbackCandidateRender();
    fallbackJobRender();
    fallbackFeedbackRender();
    fallbackSystemUsersRender();
    fallbackServiceRequestRender();
    fallbackInterviewRender();
    fallbackInternalNotesRender();
    fallbackCompanyRender();
    fallbackCatalogItemsRender();
    fallbackBillingSettingsRender();
    fallbackPaymentSessionsRender();
  }
}

function injectRuntimeInfo() {
  document.querySelectorAll("[data-runtime-mode]").forEach((badge) => {
    badge.textContent = state.mode === "cloud" ? "Modo nuvem" : "Modo local";
  });
}

async function init() {
  initMenu();
  initTabs();
  clearLegacySensitiveLocalData();
  if (hasFirebaseConfig()) await setupCloudMode();
  else { state.mode = "local"; showGlobalNotice("Versão pronta. Para salvar na nuvem, preencha o arquivo firebase-config.js."); }
  injectRuntimeInfo();
  await hydrateInitialData();
  if (state.mode === "cloud" && state.auth && (isCandidatePage() || isCompanyPage())) {
    onAuthStateChanged(state.auth, async (user) => {
      if (isCandidatePage()) {
        state.currentCandidateUser = user || null;
        await loadCandidateProfileForCurrentUser();
      }
      if (isCompanyPage()) {
        state.currentCompanyUser = user || null;
        await loadCompanyProfileForCurrentUser();
      }
    });
  }
  if (state.mode === "local") {
    const systemSession = localStore.get(KEYS.systemSession, null);
    if (systemSession && (systemSession.perfil !== "Administrador" || isMasterAdminRecord(systemSession))) {
      state.currentSystemUser = systemSession;
      syncSystemUiState(systemSession.perfil);
    } else if (systemSession?.perfil === "Administrador") {
      localStore.remove(KEYS.systemSession);
    }
  }
  initCandidatePage();
  initJobPage();
  initFeedbackPage();
  initHelpWidget();
  initNr1FloatingWhatsappButton();
  initAdminUserManagement();
  initAdminCatalogManagement();
  initAdminBillingSettingsManagement();
  initAdminSupportMeetSettingsManagement();
  initAdminHomeFeaturedSettingsManagement();
  initAdminActions();
  initInternalNotesAdminActions();
}

document.addEventListener("DOMContentLoaded", init);
