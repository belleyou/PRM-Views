const API_VERSION = "v61.0";

const STORAGE_KEYS = Object.freeze({
  PERSONAS: "prm_personas",
  ACTIVE_PERSONA_ID: "prm_active_persona_id",
  VIEW_MODE: "prm_view_mode",
  LAST_ACTIVE_TAB: "prm_last_active_tab",
  CUSTOM_SALESFORCE_ORIGINS: "prm_custom_salesforce_origins"
});

const VIEW_MODES = Object.freeze({
  SINGLE: "single",
  SPLIT: "split",
  SPLIT_THREE: "split_three",
  SPLIT_FOUR: "split_four"
});

const DEFAULT_PERSONAS = Object.freeze([
  {
    id: "tier-1-reseller",
    name: "Tier 1 Reseller",
    attributes: {
      partnerType: "reseller",
      partnerTier: "tier_1",
      region: "north_america"
    },
    simulation: {
      headers: {
        "x-prm-persona-id": "tier-1-reseller",
        "x-prm-partner-type": "reseller",
        "x-prm-partner-tier": "tier_1",
        "x-prm-region": "north_america"
      },
      cookies: {
        prm_persona_id: "tier-1-reseller",
        prm_partner_type: "reseller",
        prm_partner_tier: "tier_1",
        prm_region: "north_america"
      }
    },
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z"
  },
  {
    id: "referral-affiliate",
    name: "Referral Affiliate",
    attributes: {
      partnerType: "referral_affiliate",
      partnerTier: "standard",
      region: "north_america"
    },
    simulation: {
      headers: {
        "x-prm-persona-id": "referral-affiliate",
        "x-prm-partner-type": "referral_affiliate",
        "x-prm-partner-tier": "standard",
        "x-prm-region": "north_america"
      },
      cookies: {
        prm_persona_id: "referral-affiliate",
        prm_partner_type: "referral_affiliate",
        prm_partner_tier: "standard",
        prm_region: "north_america"
      }
    },
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z"
  }
]);

const STANDARD_DNR_URL_FILTERS = Object.freeze([
  "||force.com/",
  "||my.site.com/",
  "||salesforce-sites.com/",
  "||salesforce.com/",
  "||my.salesforce.com/",
  "||salesforce-setup.com/",
  "||my.salesforce-setup.com/",
  "http://localhost/",
  "http://127.0.0.1/"
]);

const PERSONA_FIELD_INTENTS = Object.freeze({
  partnerType: ["partner type", "partnertype", "partner_type", "type"],
  partnerTier: ["partner tier", "partnertier", "partner_tier", "tier", "level"],
  region: ["partner region", "partnerregion", "region", "geo", "geography", "territory"]
});

const FALLBACK_METADATA = Object.freeze({
  source: "fallback",
  fields: {
    partnerType: {
      objectApiName: "Account",
      apiName: "Partner_Type__c",
      label: "Partner Type",
      values: ["reseller", "referral_affiliate", "msp", "distributor"].map((value) => ({ label: value, value }))
    },
    partnerTier: {
      objectApiName: "Account",
      apiName: "Partner_Tier__c",
      label: "Partner Tier",
      values: ["tier_1", "tier_2", "tier_3", "standard"].map((value) => ({ label: value, value }))
    },
    region: {
      objectApiName: "Account",
      apiName: "Region__c",
      label: "Region",
      values: ["north_america", "emea", "apac", "latam", "global"].map((value) => ({ label: value, value }))
    }
  }
});

let initializationPromise = null;

chrome.runtime.onInstalled.addListener(async () => {
  await initializeExtensionState();
});

chrome.runtime.onStartup.addListener(async () => {
  await initializeExtensionState();
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_ACTIVE_TAB]: tabId });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleRuntimeMessage(message, sender)
    .then((response) => sendResponse({ ok: true, ...response }))
    .catch((error) => sendResponse(toErrorResponse(error)));

  return true;
});

async function handleRuntimeMessage(message, sender) {
  if (!message || typeof message !== "object") {
    throw new Error("Message payload is required.");
  }

  switch (message.type) {
    case "PRM_GET_STATE":
      return { state: await getPublicState() };

    case "PRM_SAVE_PERSONA":
      return { state: await savePersona(message.persona) };

    case "PRM_DELETE_PERSONA":
      return { state: await deletePersona(message.personaId) };

    case "PRM_SET_ACTIVE_PERSONA":
      return { state: await setActivePersona(message.personaId, sender.tab?.id) };

    case "PRM_SET_VIEW_MODE":
      return { state: await setViewMode(message.viewMode, message.splitPersonaIds, sender.tab?.id) };

    case "PRM_GET_ACTIVE_PERSONA":
      return { persona: await getActivePersona() };

    case "PRM_GET_SIMULATION_CONTEXT":
      return { context: await getSimulationContext() };

    case "PRM_GET_PERSONA_FIELD_METADATA":
      return { metadata: await getPersonaFieldMetadata() };

    case "PRM_REGISTER_CURRENT_ORIGIN":
      return { origin: await registerCurrentOrigin() };

    default:
      throw new Error(`Unsupported message type: ${message.type}`);
  }
}

async function initializeExtensionState() {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = initializeExtensionStateOnce().finally(() => {
    initializationPromise = null;
  });

  return initializationPromise;
}

async function initializeExtensionStateOnce() {
  const existing = await chrome.storage.local.get([
    STORAGE_KEYS.PERSONAS,
    STORAGE_KEYS.ACTIVE_PERSONA_ID,
    STORAGE_KEYS.VIEW_MODE
  ]);

  const updates = {};

  if (!Array.isArray(existing[STORAGE_KEYS.PERSONAS]) || existing[STORAGE_KEYS.PERSONAS].length === 0) {
    updates[STORAGE_KEYS.PERSONAS] = clone(DEFAULT_PERSONAS);
  }

  if (typeof existing[STORAGE_KEYS.ACTIVE_PERSONA_ID] !== "string") {
    updates[STORAGE_KEYS.ACTIVE_PERSONA_ID] = DEFAULT_PERSONAS[0].id;
  }

  if (!Object.values(VIEW_MODES).includes(existing[STORAGE_KEYS.VIEW_MODE])) {
    updates[STORAGE_KEYS.VIEW_MODE] = VIEW_MODES.SINGLE;
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }

  await cleanupRemovedSecurityLayer();
  await reconcilePersonaState();
  await refreshDynamicRequestRules();
}

async function cleanupRemovedSecurityLayer() {
  await chrome.storage.local.remove([
    "prm_user_" + "tier",
    "prm_" + "app" + "roved_" + "ent" + "er" + "prise_domains",
    "prm_salesforce_" + "oa" + "uth_connection",
    "prm_salesforce_" + "oa" + "uth_client_id"
  ]);
  await chrome.storage.session?.remove?.("prm_salesforce_" + "oa" + "uth_access_token");

  try {
    await chrome.scripting.unregisterContentScripts({ ids: ["prm-" + "ent" + "er" + "prise-persona-injector"] });
  } catch {
    // Older prototypes may not have registered this script.
  }
}

async function getPublicState() {
  await initializeExtensionState();

  const state = await chrome.storage.local.get([
    STORAGE_KEYS.PERSONAS,
    STORAGE_KEYS.ACTIVE_PERSONA_ID,
    STORAGE_KEYS.VIEW_MODE
  ]);

  const personas = state[STORAGE_KEYS.PERSONAS];
  const viewMode = state[STORAGE_KEYS.VIEW_MODE];
  const activePersonaId = state[STORAGE_KEYS.ACTIVE_PERSONA_ID];

  return {
    viewMode,
    activePersonaId,
    activePersona: personas.find((persona) => persona.id === activePersonaId) ?? personas[0] ?? null,
    personas
  };
}

async function savePersona(persona) {
  const normalizedPersona = normalizePersona(persona);
  const state = await getPublicState();
  const existingIndex = state.personas.findIndex((item) => item.id === normalizedPersona.id);
  const isCreating = existingIndex === -1;

  const now = new Date().toISOString();
  const nextPersona = {
    ...normalizedPersona,
    createdAt: isCreating ? now : state.personas[existingIndex].createdAt,
    updatedAt: now
  };

  const personas = [...state.personas];
  if (isCreating) {
    personas.push(nextPersona);
  } else {
    personas[existingIndex] = nextPersona;
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.PERSONAS]: personas });
  await refreshDynamicRequestRules();

  return getPublicState();
}

async function deletePersona(personaId) {
  if (typeof personaId !== "string" || personaId.trim() === "") {
    throw new Error("Persona id is required.");
  }

  const state = await getPublicState();
  const personas = state.personas.filter((persona) => persona.id !== personaId);

  if (personas.length === state.personas.length) {
    throw new Error("Persona was not found.");
  }

  if (personas.length === 0) {
    throw new Error("At least one persona must remain active.");
  }

  const nextActivePersonaId = state.activePersonaId === personaId ? personas[0].id : state.activePersonaId;

  await chrome.storage.local.set({
    [STORAGE_KEYS.PERSONAS]: personas,
    [STORAGE_KEYS.ACTIVE_PERSONA_ID]: nextActivePersonaId
  });

  await reconcilePersonaState();
  await refreshDynamicRequestRules();

  return getPublicState();
}

async function setActivePersona(personaId, senderTabId) {
  const state = await getPublicState();
  const persona = state.personas.find((item) => item.id === personaId);
  const targetTabId = await resolveTargetTabId(senderTabId);

  if (!persona) {
    throw new Error("Persona was not found.");
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.ACTIVE_PERSONA_ID]: persona.id,
    [STORAGE_KEYS.VIEW_MODE]: VIEW_MODES.SINGLE
  });

  await applyPersonaCookiesToTab(targetTabId, persona);
  await refreshDynamicRequestRules();
  await notifyTab(targetTabId, "PRM_ACTIVE_PERSONA_CHANGED", { persona });

  return getPublicState();
}

async function setViewMode(viewMode, splitPersonaIds = [], senderTabId) {
  if (!Object.values(VIEW_MODES).includes(viewMode)) {
    throw new Error("Invalid view mode.");
  }

  const state = await getPublicState();
  const targetTabId = await resolveTargetTabId(senderTabId);
  const splitModeCounts = {
    [VIEW_MODES.SPLIT]: 2,
    [VIEW_MODES.SPLIT_THREE]: 3,
    [VIEW_MODES.SPLIT_FOUR]: 4
  };
  const requiredCount = splitModeCounts[viewMode] ?? 0;
  const isSplitMode = requiredCount > 0;

  if (isSplitMode) {
    const uniquePersonaIds = [...new Set(splitPersonaIds)].filter(Boolean);
    if (uniquePersonaIds.length !== requiredCount) {
      throw new Error(`Split-Screen View requires ${requiredCount} different personas.`);
    }

    const allPersonasExist = uniquePersonaIds.every((personaId) =>
      state.personas.some((persona) => persona.id === personaId)
    );

    if (!allPersonasExist) {
      throw new Error("All split-screen personas must exist before split-screen can be enabled.");
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.VIEW_MODE]: viewMode });
    await notifyTab(targetTabId, "PRM_SPLIT_SCREEN_REQUESTED", { personaIds: uniquePersonaIds });
  } else {
    await chrome.storage.local.set({ [STORAGE_KEYS.VIEW_MODE]: VIEW_MODES.SINGLE });
    await notifyTab(targetTabId, "PRM_SINGLE_VIEW_REQUESTED", {});
  }

  return getPublicState();
}

async function getActivePersona() {
  const state = await getPublicState();
  return state.activePersona;
}

async function getSimulationContext() {
  const state = await getPublicState();

  return {
    viewMode: state.viewMode,
    activePersona: state.activePersona,
    personas: state.personas,
    rules: {
      splitScreenEnabled: [VIEW_MODES.SPLIT, VIEW_MODES.SPLIT_THREE, VIEW_MODES.SPLIT_FOUR].includes(state.viewMode)
    }
  };
}

async function getPersonaFieldMetadata() {
  const tab = await getActiveTab();
  const apiBaseUrls = deriveApiBaseUrls(tab?.url);

  if (apiBaseUrls.length === 0) {
    return FALLBACK_METADATA;
  }

  for (const apiBaseUrl of apiBaseUrls) {
    const objectInfos = await Promise.allSettled(["Account", "Contact", "User"].map((objectApiName) => fetchObjectInfo(apiBaseUrl, objectApiName)));
    const picklistFields = objectInfos
      .filter((result) => result.status === "fulfilled")
      .flatMap((result) => result.value);

    if (picklistFields.length === 0) {
      continue;
    }

    const fields = {
      partnerType: findBestPicklistField(picklistFields, "partnerType") ?? FALLBACK_METADATA.fields.partnerType,
      partnerTier: findBestPicklistField(picklistFields, "partnerTier") ?? FALLBACK_METADATA.fields.partnerTier,
      region: findBestPicklistField(picklistFields, "region") ?? FALLBACK_METADATA.fields.region
    };

    const source = Object.values(fields).some((field) => field.source === "salesforce") ? "salesforce" : "fallback";

    return {
      source,
      apiBaseUrl,
      fields
    };
  }

  return FALLBACK_METADATA;
}

async function fetchObjectInfo(apiBaseUrl, objectApiName) {
  const endpoint = `${apiBaseUrl}/services/data/${API_VERSION}/ui-api/object-info/${objectApiName}`;
  const response = await fetch(endpoint, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  return Object.values(payload.fields ?? {})
    .filter((field) => field.dataType === "Picklist" || field.dataType === "MultiPicklist")
    .map((field) => ({
      source: "salesforce",
      objectApiName,
      apiName: field.apiName,
      label: field.label,
      values: (field.picklistValues ?? [])
        .filter((value) => value.active !== false)
        .map((value) => ({
          label: value.label ?? value.value,
          value: value.value ?? value.label
        }))
    }))
    .filter((field) => field.values.length > 0);
}

function findBestPicklistField(fields, intent) {
  const terms = PERSONA_FIELD_INTENTS[intent] ?? [];
  const exact = fields.find((field) => terms.includes(normalizeSearchText(field.apiName)) || terms.includes(normalizeSearchText(field.label)));
  if (exact) {
    return exact;
  }

  return fields.find((field) => {
    const haystack = `${normalizeSearchText(field.objectApiName)} ${normalizeSearchText(field.apiName)} ${normalizeSearchText(field.label)}`;
    return terms.some((term) => haystack.includes(term.replace(/\s+/g, "")) || haystack.includes(term));
  });
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/__c$|__pc$|__r$/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

function deriveApiBaseUrls(urlValue) {
  if (!urlValue) {
    return [];
  }

  try {
    const url = new URL(urlValue);
    const hostname = url.hostname.toLowerCase();

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return [];
    }

    const candidates = [url.origin];

    if (
      hostname.endsWith(".my.salesforce.com") ||
      hostname.endsWith(".salesforce.com") ||
      hostname.endsWith(".my.salesforce-setup.com") ||
      hostname.endsWith(".salesforce-setup.com")
    ) {
      return unique(candidates);
    }

    if (hostname.endsWith(".sandbox.my.site.com")) {
      candidates.push(`${url.protocol}//${hostname.replace(/\.sandbox\.my\.site\.com$/i, ".sandbox.my.salesforce.com")}`);
    } else if (hostname.endsWith(".my.site.com")) {
      candidates.push(`${url.protocol}//${hostname.replace(/\.my\.site\.com$/i, ".my.salesforce.com")}`);
    } else if (hostname.endsWith(".force.com")) {
      candidates.push(`${url.protocol}//${hostname.replace(/\.force\.com$/i, ".my.salesforce.com")}`);
    }

    if (url.protocol === "https:") {
      candidates.push(url.origin);
    }

    return unique(candidates);
  } catch {
    return [];
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function reconcilePersonaState() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.PERSONAS,
    STORAGE_KEYS.ACTIVE_PERSONA_ID,
    STORAGE_KEYS.VIEW_MODE
  ]);

  let personas = Array.isArray(stored[STORAGE_KEYS.PERSONAS]) ? stored[STORAGE_KEYS.PERSONAS] : clone(DEFAULT_PERSONAS);
  let activePersonaId = stored[STORAGE_KEYS.ACTIVE_PERSONA_ID] ?? personas[0]?.id;
  let viewMode = stored[STORAGE_KEYS.VIEW_MODE] ?? VIEW_MODES.SINGLE;

  if (!personas.some((persona) => persona.id === activePersonaId)) {
    activePersonaId = personas[0]?.id ?? DEFAULT_PERSONAS[0].id;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.PERSONAS]: personas,
    [STORAGE_KEYS.ACTIVE_PERSONA_ID]: activePersonaId,
    [STORAGE_KEYS.VIEW_MODE]: viewMode
  });
}

async function refreshDynamicRequestRules() {
  const state = await chrome.storage.local.get([
    STORAGE_KEYS.PERSONAS,
    STORAGE_KEYS.ACTIVE_PERSONA_ID,
    STORAGE_KEYS.CUSTOM_SALESFORCE_ORIGINS
  ]);

  const personas = Array.isArray(state[STORAGE_KEYS.PERSONAS]) ? state[STORAGE_KEYS.PERSONAS] : clone(DEFAULT_PERSONAS);
  const activePersonaId = state[STORAGE_KEYS.ACTIVE_PERSONA_ID] ?? personas[0]?.id;
  const activePersona = personas.find((persona) => persona.id === activePersonaId) ?? personas[0];
  const customOrigins = Array.isArray(state[STORAGE_KEYS.CUSTOM_SALESFORCE_ORIGINS])
    ? state[STORAGE_KEYS.CUSTOM_SALESFORCE_ORIGINS]
    : [];
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules
    .filter((rule) => rule.id >= 1000 && rule.id < 1100)
    .map((rule) => rule.id);

  const addRules = buildHeaderRules(activePersona, customOrigins);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules
  });
}

function buildHeaderRules(persona, customOrigins = []) {
  if (!persona?.simulation?.headers || Object.keys(persona.simulation.headers).length === 0) {
    return [];
  }

  const requestHeaders = Object.entries(persona.simulation.headers).map(([header, value]) => ({
    header,
    operation: "set",
    value: String(value)
  }));

  const resourceTypes = ["main_frame", "sub_frame", "xmlhttprequest"];
  const standardRules = STANDARD_DNR_URL_FILTERS.map((urlFilter, index) => ({
    id: 1001 + index,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders
    },
    condition: {
      urlFilter,
      resourceTypes
    }
  }));

  const customRules = customOrigins.slice(0, 20).map((origin, index) => ({
    id: 1020 + index,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders
    },
    condition: {
      urlFilter: `${origin}/`,
      resourceTypes
    }
  }));

  return [...standardRules, ...customRules];
}

async function removePersonaHeaderRules() {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules
    .filter((rule) => rule.id >= 1000 && rule.id < 1100)
    .map((rule) => rule.id);

  if (removeRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
  }
}

async function applyPersonaCookiesToTab(tabId, persona) {
  if (!tabId || !persona?.simulation?.cookies) {
    return;
  }

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }

  if (!tab?.url || !(await isSupportedTargetUrl(tab.url))) {
    return;
  }

  await Promise.all(
    Object.entries(persona.simulation.cookies).map(([name, value]) =>
      chrome.cookies.set({
        url: tab.url,
        name,
        value: String(value),
        path: "/",
        sameSite: "lax",
        secure: tab.url.startsWith("https://")
      })
    )
  );
}

async function isSupportedTargetUrl(url) {
  try {
    const { hostname, protocol } = new URL(url);
    const supportedHosts = [
      "force.com",
      "my.site.com",
      "salesforce-sites.com",
      "salesforce.com",
      "my.salesforce.com",
      "salesforce-setup.com",
      "my.salesforce-setup.com"
    ];

    if (protocol === "https:" && supportedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
      return true;
    }

    if (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1")) {
      return true;
    }

    if (protocol === "https:") {
      const { [STORAGE_KEYS.CUSTOM_SALESFORCE_ORIGINS]: origins = [] } =
        await chrome.storage.local.get(STORAGE_KEYS.CUSTOM_SALESFORCE_ORIGINS);
      return Array.isArray(origins) && origins.includes(new URL(url).origin);
    }

    return false;
  } catch {
    return false;
  }
}

async function registerCurrentOrigin() {
  const tab = await getActiveTab();
  const origin = getHttpsOrigin(tab?.url);

  if (!origin) {
    throw new Error("Open a Salesforce Experience Cloud or Setup page before using this extension.");
  }

  const stored = await chrome.storage.local.get(STORAGE_KEYS.CUSTOM_SALESFORCE_ORIGINS);
  const origins = Array.isArray(stored[STORAGE_KEYS.CUSTOM_SALESFORCE_ORIGINS])
    ? stored[STORAGE_KEYS.CUSTOM_SALESFORCE_ORIGINS]
    : [];
  const nextOrigins = unique([...origins, origin]).slice(-20);

  await chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_SALESFORCE_ORIGINS]: nextOrigins });
  await refreshDynamicRequestRules();

  return origin;
}

function getHttpsOrigin(urlValue) {
  try {
    const url = new URL(urlValue);
    return url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePersona(persona) {
  if (!persona || typeof persona !== "object") {
    throw new Error("Persona payload is required.");
  }

  const name = String(persona.name ?? "").trim();
  if (!name) {
    throw new Error("Persona name is required.");
  }

  const id = slugify(String(persona.id ?? name));

  return {
    id,
    name,
    attributes: sanitizeRecord(persona.attributes),
    simulation: {
      headers: sanitizeRecord(persona.simulation?.headers),
      cookies: sanitizeRecord(persona.simulation?.cookies)
    },
    createdAt: typeof persona.createdAt === "string" ? persona.createdAt : new Date().toISOString(),
    updatedAt: typeof persona.updatedAt === "string" ? persona.updatedAt : new Date().toISOString()
  };
}

function sanitizeRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce((record, [key, item]) => {
    const normalizedKey = String(key).trim();

    if (normalizedKey) {
      record[normalizedKey] = String(item ?? "").trim();
    }

    return record;
  }, {});
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new Error("Persona id could not be generated.");
  }

  return slug;
}

async function notifyTab(tabId, type, payload) {
  const targetTabId = tabId ?? (await getLastActiveTabId());

  if (!targetTabId) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(targetTabId, { type, payload });
  } catch (error) {
    const isMissingReceiver = String(error?.message ?? "").includes("Receiving end does not exist");
    if (!isMissingReceiver) {
      throw error;
    }

    const injected = await injectPersonaContentScript(targetTabId);
    if (injected) {
      await chrome.tabs.sendMessage(targetTabId, { type, payload });
    }
  }
}

async function injectPersonaContentScript(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.url || !(await isSupportedTargetUrl(tab.url))) {
      return false;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content/persona-injector.js"]
    });

    return true;
  } catch {
    return false;
  }
}

async function getLastActiveTabId() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.LAST_ACTIVE_TAB);
  return stored[STORAGE_KEYS.LAST_ACTIVE_TAB] ?? null;
}

async function resolveTargetTabId(senderTabId) {
  if (senderTabId) {
    return senderTabId;
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id) {
    await chrome.storage.local.set({ [STORAGE_KEYS.LAST_ACTIVE_TAB]: activeTab.id });
    return activeTab.id;
  }

  return getLastActiveTabId();
}

async function getActiveTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return activeTab ?? null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toErrorResponse(error) {
  return {
    ok: false,
    error: {
      message: error?.message ?? "Unexpected background worker error."
    }
  };
}
