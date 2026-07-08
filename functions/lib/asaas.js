"use strict";

const BASE_URLS = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3"
};

class AsaasError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "AsaasError";
    this.status = status;
    this.details = details;
  }
}

function createAsaasClient({ apiKey, environment = "sandbox", fetchImpl = fetch }) {
  const baseUrl = BASE_URLS[environment];
  if (!baseUrl) throw new Error("ASAAS_ENV_INVALID");
  if (!apiKey) throw new Error("ASAAS_API_KEY_MISSING");

  async function request(path, options = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...options,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "ConduzirTalentos/1.0 (Firebase Functions)",
        access_token: apiKey,
        ...(options.headers || {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body?.errors?.map((item) => item.description).filter(Boolean).join("; ")
        || body?.message
        || `ASAAS_HTTP_${response.status}`;
      throw new AsaasError(message, response.status, body);
    }
    return body;
  }

  return {
    createCustomer: (payload) => request("/customers", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
    getCustomer: (id) => request(`/customers/${encodeURIComponent(id)}`),
    createSubscription: (payload) => request("/subscriptions", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
    createPayment: (payload) => request("/payments", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
    listSubscriptionPayments: (subscriptionId) =>
      request(`/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=1&offset=0`)
  };
}

module.exports = { AsaasError, createAsaasClient };
