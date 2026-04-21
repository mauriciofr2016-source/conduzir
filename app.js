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
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const KEYS = {
  candidates: "bt_candidates",
  jobs: "bt_jobs",
  feedbacks: "bt_feedbacks",
  systemUsers: "bt_system_users",
  serviceRequests: "bt_service_requests",
  interviews: "bt_interviews",
  internalNotes: "bt_internal_notes"
};

const COLLECTIONS = {
  candidates: "candidates",
  jobs: "jobs",
  feedbacks: "feedbacks",
  systemUsers: "system_users",
  serviceRequests: "service_requests",
  interviews: "interviews",
  internalNotes: "internal_notes"
};

const defaultJobs = [
  { titulo: "Analista de RH", area: "Recursos Humanos", modelo: "Presencial", status: "Aberta" }
];

const state = {
  mode: "local",
  firestore: null,
  systemUsers: [],
  candidates: [],
  jobs: [],
  feedbacks: [],
  serviceRequests: [],
  interviews: [],
  internalNotes: [],
  adminUserEditId: null,
  adminUserSearchTerm: "",
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

async function setupCloudMode() {
  try {
    const config = window.BT_FIREBASE_CONFIG;
    const app = getApps().length ? getApps()[0] : initializeApp(config);
    state.firestore = getFirestore(app);
    state.mode = "cloud";
    showGlobalNotice("Versão ativa: dados salvos na nuvem com Firebase.");
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

function filterCandidatesForCompany(items) {
  const search = state.companyCandidateFilters.search.trim().toLowerCase();
  const area = state.companyCandidateFilters.area.trim().toLowerCase();
  const region = state.companyCandidateFilters.region.trim().toLowerCase();
  return items.filter((item) => {
    const matchesSearch = !search || [item.nome, item.email].some((value) => `${value || ""}`.toLowerCase().includes(search));
    const matchesArea = !area || `${item.area || ""}`.toLowerCase().includes(area);
    const matchesRegion = !region || `${item.regiao || ""}`.toLowerCase().includes(region);
    return matchesSearch && matchesArea && matchesRegion;
  });
}

function renderCandidateCards(items, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!items.length) {
    container.innerHTML = '<article class="mini-card"><strong>Nenhum candidato cadastrado</strong><p>Cadastre um perfil na área do candidato para visualizar dados aqui.</p></article>';
    return;
  }
  container.innerHTML = items.map((item) => `
    <article class="mini-card candidate-card">
      <strong>${escapeHtml(item.nome || "Sem nome")}</strong>
      <p><strong>Área:</strong> ${escapeHtml(item.area || "Não informada")}</p>
      <p><strong>Região:</strong> ${escapeHtml(item.regiao || "Não informada")}</p>
      <p><strong>Nível:</strong> ${escapeHtml(item.nivel || "Não informado")}</p>
      <p><strong>E-mail:</strong> ${escapeHtml(item.email || "Não informado")}</p>
      <p><strong>Resumo:</strong> ${escapeHtml(item.resumo || "Sem resumo preenchido.")}</p>
    </article>
  `).join("");
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

function renderHomeCandidates(data) {
  const host = document.getElementById("homeCandidateCards");
  if (!host) return;
  const featured = (Array.isArray(data) ? data : []).slice(0, 4);
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

function renderCandidateViews(data) {
  state.candidates = Array.isArray(data) ? data : [];
  renderCandidateCards(filterCandidatesForCompany(state.candidates), "candidateCards");
  renderCandidateCards(state.candidates, "consultantCandidates");
  renderHomeCandidates(state.candidates);

  const preview = document.getElementById("candidateProfilePreview");
  if (preview) {
    const latest = state.candidates[0];
    preview.innerHTML = latest
      ? `
      <article class="mini-card"><strong>Área</strong><p>${escapeHtml(latest.area || "Não informada")}</p></article>
      <article class="mini-card"><strong>Nível</strong><p>${escapeHtml(latest.nivel || "Não informado")}</p></article>
      <article class="mini-card"><strong>Competências</strong><p>${escapeHtml(latest.competencias || "Não preenchidas")}</p></article>
      <article class="mini-card"><strong>Valores</strong><p>${escapeHtml(latest.valores || "Não preenchidos")}</p></article>`
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
  renderCandidateStatus();
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
  const candidateList = document.getElementById("candidateServiceList");
  if (candidateList) {
    candidateList.innerHTML = state.serviceRequests.filter((item) => item.origin === "candidate").length
      ? state.serviceRequests.filter((item) => item.origin === "candidate").map((item) => `
        <article class="stack-item">
          <strong>${escapeHtml(item.tipo || "Serviço")}</strong>
          <p><strong>E-mail:</strong> ${escapeHtml(item.email || "Não informado")}</p>
          <p>${escapeHtml(item.mensagem || "Sem detalhes adicionais.")}</p>
        </article>`).join("")
      : '<article class="mini-card"><strong>Nenhuma solicitação enviada</strong><p>As solicitações de serviços adicionais aparecerão aqui.</p></article>';
  }

  const companyList = document.getElementById("companyRequestsList");
  if (companyList) {
    const companyItems = state.serviceRequests.filter((item) => item.origin === "company");
    companyList.innerHTML = companyItems.length
      ? companyItems.map((item) => `
        <article class="stack-item">
          <strong>${escapeHtml(item.empresa || "Empresa")}</strong>
          <p><strong>Solicitação:</strong> ${escapeHtml(item.tipo || "Não informado")}</p>
          <p><strong>Responsável:</strong> ${escapeHtml(item.responsavel || "Não informado")}</p>
          <p><strong>Contato:</strong> ${escapeHtml(item.contato || "Não informado")}</p>
          <p>${escapeHtml(item.mensagem || "Sem mensagem.")}</p>
        </article>`).join("")
      : '<article class="mini-card"><strong>Nenhuma solicitação enviada</strong><p>As solicitações da empresa para a consultora aparecerão aqui.</p></article>';
  }

  document.getElementById("companyReportRequests") && (document.getElementById("companyReportRequests").textContent = state.serviceRequests.filter((item) => item.origin === "company").length);
}

function renderInterviews(data) {
  state.interviews = Array.isArray(data) ? data : [];
  const candidateBody = document.getElementById("candidateInterviews");
  if (candidateBody) {
    candidateBody.innerHTML = state.interviews.length ? state.interviews.map((item) => `
      <tr>
        <td>${escapeHtml(item.data || "—")}</td>
        <td>${escapeHtml(item.empresa || "—")}</td>
        <td>${escapeHtml(item.formato || "—")}</td>
        <td>${escapeHtml(item.status || "—")}</td>
      </tr>`).join("") : '<tr><td>—</td><td>Nenhuma entrevista agendada</td><td>—</td><td>—</td></tr>';
  }
  const consultantBody = document.getElementById("interviewTableBody");
  if (consultantBody) {
    consultantBody.innerHTML = state.interviews.length ? state.interviews.map((item) => `
      <tr>
        <td>${escapeHtml(item.data || "—")}</td>
        <td>${escapeHtml(item.candidato || "—")}</td>
        <td>${escapeHtml(item.empresa || "—")}</td>
        <td>${escapeHtml(item.formato || "—")}</td>
        <td>${escapeHtml(item.status || "—")}</td>
      </tr>`).join("") : '<tr><td>—</td><td>Nenhuma entrevista cadastrada</td><td>—</td><td>—</td><td>—</td></tr>';
  }
  document.getElementById("consultantInterviewCount") && (document.getElementById("consultantInterviewCount").textContent = state.interviews.length);
  renderCandidateStatus();
}

function renderInternalNotes(data) {
  state.internalNotes = Array.isArray(data) ? data : [];
  const list = document.getElementById("internalNotesList");
  if (!list) return;
  list.innerHTML = state.internalNotes.length ? state.internalNotes.map((item) => `
    <article class="stack-item">
      <strong>${escapeHtml(item.titulo || "Anotação interna")}</strong>
      <p><strong>Área:</strong> ${escapeHtml(item.setor || "Geral")}</p>
      <p>${escapeHtml(item.mensagem || "Sem conteúdo.")}</p>
      <p><strong>Registrado em:</strong> ${formatCreatedAt(item.createdAt)}</p>
    </article>`).join("") : '<article class="mini-card"><strong>Nenhuma anotação interna</strong><p>As anotações estratégicas da consultora aparecerão aqui.</p></article>';
}

function renderSystemUsers(data) {
  state.systemUsers = Array.isArray(data) ? data : [];
  const term = state.adminUserSearchTerm.trim().toLowerCase();
  const filteredUsers = term ? state.systemUsers.filter((item) => [item.nome, item.login, item.perfil, item.status].some((value) => `${value || ""}`.toLowerCase().includes(term))) : state.systemUsers;
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
          <p><strong>Senha:</strong> <span>${escapeHtml(item.senha || "—")}</span></p>
          <p><strong>Contato:</strong> <span>${escapeHtml(item.contato || "Não informado")}</span></p>
          <p><strong>Cadastrado em:</strong> <span>${formatCreatedAt(item.createdAt)}</span></p>
        </div>
        <p><strong>Observações:</strong> ${escapeHtml(item.observacoes || "Sem observações internas.")}</p>
        <div class="form-actions compact-actions">
          <button type="button" class="btn btn-secondary" data-user-action="edit" data-user-id="${item.id}">Editar</button>
          <button type="button" class="btn btn-secondary" data-user-action="duplicate" data-user-id="${item.id}">Duplicar dados no formulário</button>
          <button type="button" class="btn btn-secondary danger-button" data-user-action="delete" data-user-id="${item.id}">Excluir</button>
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
        <p><strong>Senha:</strong> ${escapeHtml(item.senha || "—")}</p>
      </article>`).join("") : '<article class="mini-card"><strong>Nenhum usuário criado ainda</strong><p>Cadastre o primeiro login na aba Gestão de Usuários.</p></article>';
  }
  document.getElementById("adminUserCount") && (document.getElementById("adminUserCount").textContent = state.systemUsers.length);
  document.getElementById("adminUsersBadgeCount") && (document.getElementById("adminUsersBadgeCount").textContent = state.systemUsers.length);
  document.getElementById("reportUsers") && (document.getElementById("reportUsers").textContent = state.systemUsers.length);
}

function renderCandidateTests() {
  const grid = document.getElementById("candidateTestsGrid");
  if (!grid) return;
  const totalFeedbacks = state.feedbacks.length;
  grid.innerHTML = `
    <article class="mini-card"><strong>Perfil comportamental</strong><p>Status: ${totalFeedbacks ? "em análise pela consultoria" : "aguardando aplicação"}.</p></article>
    <article class="mini-card"><strong>Avaliação psicossocial</strong><p>Status: ${totalFeedbacks > 1 ? "há registros no sistema" : "em triagem"}.</p></article>
    <article class="mini-card"><strong>Teste técnico</strong><p>Status: ${totalFeedbacks ? "acompanhe atualizações no parecer da consultora" : "ainda não solicitado"}.</p></article>`;
}

function renderCandidateStatus() {
  const timeline = document.getElementById("candidateProcessTimeline");
  if (!timeline) return;
  timeline.innerHTML = `
    <div class="timeline-item done"><strong>Cadastro realizado</strong><span>${state.candidates.length ? "Perfil salvo no sistema e disponível para análise." : "Preencha e salve seu perfil para ativar a base."}</span></div>
    <div class="timeline-item ${state.feedbacks.length ? "done" : ""}"><strong>Triagem inicial</strong><span>${state.feedbacks.length ? "Há pareceres ou avaliações registrados pela consultoria." : "Aguardando análise da consultoria."}</span></div>
    <div class="timeline-item ${state.interviews.length ? "done" : ""}"><strong>Entrevistas</strong><span>${state.interviews.length ? "Existe ao menos uma entrevista ou acompanhamento registrado." : "Nenhuma entrevista agendada no momento."}</span></div>
    <div class="timeline-item ${state.serviceRequests.length ? "done" : ""}"><strong>Serviços adicionais</strong><span>${state.serviceRequests.length ? "Há solicitações registradas no sistema." : "Você pode solicitar apoio em currículo, testes e carreira."}</span></div>`;
}

async function saveCandidate(data) {
  await saveRecord("candidates", data);
  if (state.mode === "local") renderCandidateViews(state.candidates);
}

async function saveJob(data) {
  await saveRecord("jobs", { ...data, status: "Aberta" });
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
  return state.systemUsers.find((item) => item.id !== ignoreId && `${item.login || ""}`.trim().toLowerCase() === normalizedLogin) || null;
}

async function saveSystemUser(data) {
  const duplicated = await findExistingUserByLogin(data.login);
  if (duplicated) throw new Error("LOGIN_EXISTS");
  await saveRecord("systemUsers", data);
  if (state.mode === "local") renderSystemUsers(state.systemUsers);
}

async function updateSystemUserRecord(userId, data) {
  if (!userId) throw new Error("USER_ID_REQUIRED");
  const duplicated = await findExistingUserByLogin(data.login, userId);
  if (duplicated) throw new Error("LOGIN_EXISTS");
  await updateRecord("systemUsers", userId, data);
  if (state.mode === "local") renderSystemUsers(state.systemUsers);
}

async function deleteSystemUserRecord(userId) {
  if (!userId) throw new Error("USER_ID_REQUIRED");
  await deleteRecord("systemUsers", userId);
  if (state.mode === "local") renderSystemUsers(state.systemUsers);
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

function initCandidatePage() {
  const form = document.getElementById("candidateForm");
  if (!form) return;
  const successMessage = document.getElementById("candidateSuccessMessage");
  const submitButton = document.getElementById("candidateSubmitBtn");
  const submitArea = form.parentElement;
  let isSubmitting = false;
  let lastSubmissionFingerprint = "";
  let lastSubmissionAt = 0;
  let buttonCooldownTimer = null;

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
  function fingerprintData(data) { return JSON.stringify(data); }

  const localSaved = localStore.get(KEYS.candidates, []);
  if (localSaved[0]) {
    Object.entries(localSaved[0]).forEach(([key, value]) => {
      const field = form.elements.namedItem(key);
      if (field && typeof value === "string") field.value = value;
    });
    document.getElementById("curriculoNome") && (document.getElementById("curriculoNome").textContent = localSaved[0].curriculoArquivo || "Nenhum currículo informado.");
  }

  document.getElementById("fillCandidateDemo")?.addEventListener("click", () => {
    const demo = {
      nome: "Maurício Silva",
      email: "mauricio@email.com",
      telefone: "(64) 99999-9999",
      regiao: "Rio Verde - GO",
      area: "Recursos Humanos",
      nivel: "Pleno",
      resumo: "Profissional com experiência em atendimento, rotinas administrativas, organização e relacionamento interpessoal.",
      competencias: "Pacote Office, atendimento, organização de processos, comunicação, triagem inicial.",
      valores: "Responsabilidade, ética, compromisso, respeito e boa comunicação.",
      curriculoArquivo: "curriculo-mauricio.pdf"
    };
    Object.entries(demo).forEach(([key, value]) => { const field = form.elements.namedItem(key); if (field) field.value = value; });
    document.getElementById("curriculoNome") && (document.getElementById("curriculoNome").textContent = demo.curriculoArquivo);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const fingerprint = fingerprintData(data);
    const now = Date.now();
    if (isSubmitting) return showCandidateMessage("Seus dados já estão sendo salvos. Aguarde um instante.", "info");
    if (fingerprint === lastSubmissionFingerprint && now - lastSubmissionAt < 15000) return showCandidateMessage("Esses dados já foram salvos agora há pouco.", "info");
    try {
      isSubmitting = true;
      if (successMessage) { successMessage.style.display = "none"; successMessage.classList.remove("is-error", "is-info"); }
      setSubmitButtonState(true, "Salvando...");
      await saveCandidate(data);
      lastSubmissionFingerprint = fingerprint;
      lastSubmissionAt = Date.now();
      form.reset();
      document.getElementById("curriculoNome") && (document.getElementById("curriculoNome").textContent = data.curriculoArquivo || "Nenhum currículo informado.");
      showCandidateMessage("Seus dados foram salvos com sucesso.", "success");
      clearTimeout(buttonCooldownTimer);
      setSubmitButtonState(true, "Dados salvos");
      buttonCooldownTimer = setTimeout(() => setSubmitButtonState(false, "Salvar perfil"), 4000);
    } catch (error) {
      console.error("Erro ao salvar candidato:", error);
      showCandidateMessage("Não foi possível salvar agora. Tente novamente.", "error");
      setSubmitButtonState(false, "Salvar perfil");
    } finally {
      isSubmitting = false;
    }
  });

  const candidateServiceForm = document.getElementById("candidateServiceForm");
  candidateServiceForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(candidateServiceForm).entries());
    try {
      await saveServiceRequest({ ...payload, origin: "candidate" });
      candidateServiceForm.reset();
      createNotice("Solicitação enviada com sucesso para a equipe.", candidateServiceForm.parentElement);
    } catch (error) {
      console.error(error);
      createNotice("Não foi possível enviar a solicitação agora.", candidateServiceForm.parentElement);
    }
  });
}

function initJobPage() {
  const form = document.getElementById("jobForm");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await saveJob(data);
      form.reset();
      createNotice(state.mode === "cloud" ? "Vaga cadastrada com sucesso na nuvem." : "Vaga cadastrada com sucesso.", form.parentElement);
    } catch (error) {
      console.error("Erro ao salvar vaga:", error);
      createNotice("Não foi possível cadastrar a vaga agora. Confira o Firebase.", form.parentElement);
    }
  });

  const companyRequestForm = document.getElementById("companyRequestForm");
  companyRequestForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(companyRequestForm).entries());
    try {
      await saveServiceRequest({ ...data, origin: "company" });
      companyRequestForm.reset();
      createNotice("Solicitação enviada para a consultora com sucesso.", companyRequestForm.parentElement);
    } catch (error) {
      console.error(error);
      createNotice("Não foi possível enviar a solicitação agora.", companyRequestForm.parentElement);
    }
  });

  document.getElementById("companyCandidateSearch")?.addEventListener("input", (event) => {
    state.companyCandidateFilters.search = event.target.value || "";
    renderCandidateViews(state.candidates);
  });
  document.getElementById("companyCandidateAreaFilter")?.addEventListener("input", (event) => {
    state.companyCandidateFilters.area = event.target.value || "";
    renderCandidateViews(state.candidates);
  });
  document.getElementById("companyCandidateRegionFilter")?.addEventListener("input", (event) => {
    state.companyCandidateFilters.region = event.target.value || "";
    renderCandidateViews(state.candidates);
  });
}

function initFeedbackPage() {
  const form = document.getElementById("feedbackForm");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await saveFeedback(data);
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
    try {
      await saveInterview(data);
      interviewForm.reset();
      createNotice("Entrevista registrada com sucesso.", interviewForm.parentElement);
    } catch (error) {
      console.error(error);
      createNotice("Não foi possível salvar a entrevista agora.", interviewForm.parentElement);
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
  form.reset();
  state.adminUserEditId = null;
  document.getElementById("adminUserId") && (document.getElementById("adminUserId").value = "");
  document.getElementById("adminUserFormTitle") && (document.getElementById("adminUserFormTitle").textContent = "Adicionar novo usuário");
  document.getElementById("adminUserSubmitBtn") && (document.getElementById("adminUserSubmitBtn").textContent = "Salvar usuário");
  document.getElementById("adminUserNome")?.focus();
}

function fillAdminUserForm(user) {
  if (!user) return;
  state.adminUserEditId = user.id;
  document.getElementById("adminUserId").value = user.id || "";
  document.getElementById("adminUserNome").value = user.nome || "";
  document.getElementById("adminUserLogin").value = user.login || "";
  document.getElementById("adminUserSenha").value = user.senha || "";
  document.getElementById("adminUserPerfil").value = user.perfil || "Administrador";
  document.getElementById("adminUserStatus").value = user.status || "Ativo";
  document.getElementById("adminUserContato").value = user.contato || "";
  document.getElementById("adminUserObservacoes").value = user.observacoes || "";
  document.getElementById("adminUserFormTitle") && (document.getElementById("adminUserFormTitle").textContent = `Editando usuário: ${user.nome || user.login || "Sem nome"}`);
  document.getElementById("adminUserSubmitBtn") && (document.getElementById("adminUserSubmitBtn").textContent = "Salvar alterações");
  document.querySelector('[data-tab="perfis"]')?.click();
}

function initAdminUserManagement() {
  const form = document.getElementById("adminUserForm");
  if (!form) return;
  document.getElementById("adminUserSearch")?.addEventListener("input", (event) => {
    state.adminUserSearchTerm = event.target.value || "";
    renderSystemUsers(state.systemUsers);
  });
  document.getElementById("adminUserCancelEditBtn")?.addEventListener("click", () => {
    clearAdminUserForm();
    showAdminUserNotice("Formulário limpo. Você pode cadastrar um novo usuário.", "info");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = document.getElementById("adminUserSubmitBtn");
    const payload = Object.fromEntries(new FormData(form).entries());
    const userId = payload.userId || state.adminUserEditId || "";
    delete payload.userId;
    ["nome", "login", "senha", "contato", "observacoes"].forEach((key) => payload[key] = `${payload[key] || ""}`.trim());
    if (!payload.nome || !payload.login || !payload.senha || !payload.perfil || !payload.status) {
      return showAdminUserNotice("Preencha nome, login, senha, perfil e status para salvar o usuário.", "error");
    }
    try {
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = userId ? "Salvando alterações..." : "Salvando usuário..."; }
      if (userId) {
        await updateSystemUserRecord(userId, payload);
        showAdminUserNotice("Usuário atualizado com sucesso.");
      } else {
        await saveSystemUser(payload);
        showAdminUserNotice("Usuário criado com sucesso.");
      }
      clearAdminUserForm();
    } catch (error) {
      console.error(error);
      showAdminUserNotice(error.message === "LOGIN_EXISTS" ? "Já existe outro usuário com esse login. Use um login diferente." : "Não foi possível salvar o usuário agora. Tente novamente.", "error");
    } finally {
      if (submitButton) { submitButton.disabled = false; submitButton.textContent = state.adminUserEditId ? "Salvar alterações" : "Salvar usuário"; }
    }
  });

  document.getElementById("adminUsersList")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-user-action]");
    if (!button) return;
    const action = button.dataset.userAction;
    const userId = button.dataset.userId;
    const user = state.systemUsers.find((item) => item.id === userId);
    if (!user) return showAdminUserNotice("Usuário não encontrado para esta ação.", "error");
    if (action === "edit" || action === "duplicate") {
      fillAdminUserForm(action === "edit" ? user : { ...user, id: "", login: "" });
      if (action === "duplicate") {
        state.adminUserEditId = null;
        document.getElementById("adminUserId").value = "";
        document.getElementById("adminUserFormTitle").textContent = `Duplicando usuário: ${user.nome || user.login || "Sem nome"}`;
        document.getElementById("adminUserSubmitBtn").textContent = "Salvar usuário";
        showAdminUserNotice("Dados carregados no formulário. Defina um novo login antes de salvar.", "info");
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
    clearAdminUserForm();
    createNotice("Dados locais removidos com sucesso.", button.parentElement);
  });
}

async function hydrateInitialData() {
  try {
    const [candidates, jobs, feedbacks, systemUsers, serviceRequests, interviews, internalNotes] = await Promise.all([
      fetchCollection("candidates", []),
      fetchCollection("jobs", defaultJobs),
      fetchCollection("feedbacks", []),
      fetchCollection("systemUsers", []),
      fetchCollection("serviceRequests", []),
      fetchCollection("interviews", []),
      fetchCollection("internalNotes", [])
    ]);
    renderCandidateViews(candidates);
    renderJobs(jobs.length ? jobs : defaultJobs);
    renderFeedbacks(feedbacks);
    renderSystemUsers(systemUsers);
    renderServiceRequests(serviceRequests);
    renderInterviews(interviews);
    renderInternalNotes(internalNotes);
  } catch (error) {
    console.error("Erro ao carregar dados iniciais:", error);
    fallbackCandidateRender();
    fallbackJobRender();
    fallbackFeedbackRender();
    fallbackSystemUsersRender();
    fallbackServiceRequestRender();
    fallbackInterviewRender();
    fallbackInternalNotesRender();
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
  if (hasFirebaseConfig()) await setupCloudMode();
  else { state.mode = "local"; showGlobalNotice("Versão pronta. Para salvar na nuvem, preencha o arquivo firebase-config.js."); }
  injectRuntimeInfo();
  await hydrateInitialData();
  initCandidatePage();
  initJobPage();
  initFeedbackPage();
  initAdminUserManagement();
  initAdminActions();
}

document.addEventListener("DOMContentLoaded", init);
