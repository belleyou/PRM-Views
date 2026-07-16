const ACTIONS = Object.freeze({
  GET_STATE: "PRM_GET_STATE",
  SAVE_PERSONA: "PRM_SAVE_PERSONA",
  DELETE_PERSONA: "PRM_DELETE_PERSONA",
  SET_ACTIVE_PERSONA: "PRM_SET_ACTIVE_PERSONA",
  SET_VIEW_MODE: "PRM_SET_VIEW_MODE",
  GET_PERSONA_FIELD_METADATA: "PRM_GET_PERSONA_FIELD_METADATA",
  REGISTER_CURRENT_ORIGIN: "PRM_REGISTER_CURRENT_ORIGIN"
});

const VIEW_MODES = Object.freeze({
  SINGLE: "single",
  SPLIT: "split",
  SPLIT_THREE: "split_three",
  SPLIT_FOUR: "split_four"
});

const FALLBACK_PICKLISTS = Object.freeze({
  partnerType: {
    apiName: "Partner_Type__c",
    objectApiName: "Account",
    values: ["reseller", "referral_affiliate", "msp", "distributor"]
  },
  partnerTier: {
    apiName: "Partner_Tier__c",
    objectApiName: "Account",
    values: ["tier_1", "tier_2", "tier_3", "standard"]
  },
  region: {
    apiName: "Region__c",
    objectApiName: "Account",
    values: ["north_america", "emea", "apac", "latam", "global"]
  }
});

const elements = {
  activePersonaLabel: document.querySelector("#active-persona-label"),
  personaCount: document.querySelector("#persona-count"),
  personaList: document.querySelector("#persona-list"),
  singleViewButton: document.querySelector("#single-view-button"),
  splitViewButton: document.querySelector("#split-view-button"),
  splitThreeViewButton: document.querySelector("#split-three-view-button"),
  splitFourViewButton: document.querySelector("#split-four-view-button"),
  splitViewNote: document.querySelector("#split-view-note"),
  splitThreeViewNote: document.querySelector("#split-three-view-note"),
  splitFourViewNote: document.querySelector("#split-four-view-note"),
  newPersonaButton: document.querySelector("#new-persona-button"),
  personaEditor: document.querySelector("#persona-editor"),
  editorTitle: document.querySelector("#editor-title"),
  closeEditorButton: document.querySelector("#close-editor-button"),
  cancelEditorButton: document.querySelector("#cancel-editor-button"),
  personaForm: document.querySelector("#persona-form"),
  personaName: document.querySelector("#persona-name"),
  metadataStatus: document.querySelector("#metadata-status"),
  partnerType: document.querySelector("#partner-type"),
  partnerTier: document.querySelector("#partner-tier"),
  region: document.querySelector("#region"),
  partnerTypeApi: document.querySelector("#partner-type-api"),
  partnerTierApi: document.querySelector("#partner-tier-api"),
  regionApi: document.querySelector("#region-api"),
  statusMessage: document.querySelector("#status-message")
};

let currentState = null;
let personaMetadata = null;
let editingPersonaId = null;

document.addEventListener("DOMContentLoaded", initializePopup);

async function initializePopup() {
  bindEvents();
  renderPicklistControls(null);
  await ensureCurrentOriginAccess(false);
  await Promise.all([loadState(), loadPersonaFieldMetadata()]);
}

function bindEvents() {
  elements.singleViewButton.addEventListener("click", () => setViewMode(VIEW_MODES.SINGLE));
  elements.splitViewButton.addEventListener("click", () => handleSplitViewClick(2));
  elements.splitThreeViewButton.addEventListener("click", () => handleSplitViewClick(3));
  elements.splitFourViewButton.addEventListener("click", () => handleSplitViewClick(4));
  elements.newPersonaButton.addEventListener("click", openNewPersonaEditor);
  elements.closeEditorButton.addEventListener("click", closePersonaEditor);
  elements.cancelEditorButton.addEventListener("click", closePersonaEditor);
  elements.personaForm.addEventListener("submit", handlePersonaSubmit);
}

async function loadState() {
  setStatus("Loading extension state...");

  try {
    const response = await sendMessage({ type: ACTIONS.GET_STATE });
    currentState = response.state;
    renderState(currentState);
    setStatus("Ready");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function loadPersonaFieldMetadata() {
  elements.metadataStatus.textContent = "Detecting Salesforce picklist fields...";

  try {
    await ensureCurrentOriginAccess(false);
    const response = await sendMessage({ type: ACTIONS.GET_PERSONA_FIELD_METADATA });
    personaMetadata = response.metadata;
    renderPicklistControls(personaMetadata);
    elements.metadataStatus.textContent = response.metadata?.source === "salesforce"
      ? "Picklist values detected from the active Salesforce org."
      : "Using starter values. Salesforce metadata requires an active Salesforce session with API Enabled.";
  } catch {
    personaMetadata = buildFallbackMetadata();
    renderPicklistControls(personaMetadata);
    elements.metadataStatus.textContent = "Using starter values. Open a Salesforce org where your user has API Enabled.";
  }
}

function renderState(state) {
  const isSplitTwo = state.viewMode === VIEW_MODES.SPLIT;
  const isSplitThree = state.viewMode === VIEW_MODES.SPLIT_THREE;
  const isSplitFour = state.viewMode === VIEW_MODES.SPLIT_FOUR;
  const personaCountText = `${state.personas.length} saved`;

  elements.activePersonaLabel.textContent = state.activePersona ? state.activePersona.name : "No active persona";
  elements.personaCount.textContent = personaCountText;

  elements.singleViewButton.classList.toggle("is-active", !isSplitTwo && !isSplitThree && !isSplitFour);
  elements.singleViewButton.setAttribute("aria-checked", String(!isSplitTwo && !isSplitThree && !isSplitFour));

  elements.splitViewButton.classList.toggle("is-active", isSplitTwo);
  elements.splitViewButton.setAttribute("aria-checked", String(isSplitTwo));
  elements.splitViewNote.textContent = "Compare two";

  elements.splitThreeViewButton.classList.toggle("is-active", isSplitThree);
  elements.splitThreeViewButton.setAttribute("aria-checked", String(isSplitThree));
  elements.splitThreeViewNote.textContent = "Three views";

  elements.splitFourViewButton.classList.toggle("is-active", isSplitFour);
  elements.splitFourViewButton.setAttribute("aria-checked", String(isSplitFour));
  elements.splitFourViewNote.textContent = "Four views";

  elements.newPersonaButton.disabled = false;
  elements.newPersonaButton.title = "Create a custom partner persona";

  renderPersonaList(state);
}

function renderPicklistControls(metadata) {
  const data = metadata?.fields ?? buildFallbackMetadata().fields;
  renderSelect(elements.partnerType, data.partnerType, "reseller");
  renderSelect(elements.partnerTier, data.partnerTier, "standard");
  renderSelect(elements.region, data.region, "global");
  renderFieldApi(elements.partnerTypeApi, data.partnerType);
  renderFieldApi(elements.partnerTierApi, data.partnerTier);
  renderFieldApi(elements.regionApi, data.region);
}

function renderSelect(select, field, fallbackValue) {
  const previousValue = select.value;
  const values = normalizeValues(field?.values, fallbackValue);
  select.replaceChildren();

  values.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    select.append(option);
  });

  select.value = values.some((item) => item.value === previousValue) ? previousValue : values[0]?.value ?? fallbackValue;
}

function renderFieldApi(element, field) {
  const objectApiName = field?.objectApiName ?? "Account";
  const apiName = field?.apiName ?? "Not detected";
  element.textContent = `Field API: ${objectApiName}.${apiName}`;
}

function normalizeValues(values, fallbackValue) {
  const normalized = Array.isArray(values)
    ? values.map((item) => ({
      label: String(item.label ?? item.value ?? item).trim(),
      value: String(item.value ?? item.label ?? item).trim()
    })).filter((item) => item.value)
    : [];

  if (normalized.length > 0) {
    return normalized;
  }

  return [{ label: fallbackValue, value: fallbackValue }];
}

function renderPersonaList(state) {
  elements.personaList.replaceChildren();

  state.personas.forEach((persona) => {
    const card = document.createElement("article");
    card.className = "persona-card";
    card.classList.toggle("is-active", persona.id === state.activePersonaId);

    const summary = document.createElement("div");
    summary.className = "persona-summary";

    const nameRow = document.createElement("div");
    nameRow.className = "persona-name-row";

    if (persona.id === state.activePersonaId) {
      const activeDot = document.createElement("span");
      activeDot.className = "active-dot";
      activeDot.setAttribute("aria-label", "Active persona");
      nameRow.append(activeDot);
    }

    const name = document.createElement("div");
    name.className = "persona-name";
    name.textContent = persona.name;
    nameRow.append(name);

    const meta = document.createElement("div");
    meta.className = "persona-meta";
    meta.textContent = buildPersonaMeta(persona);

    summary.append(nameRow, meta);

    const actions = document.createElement("div");
    actions.className = "persona-actions";

    const activateButton = document.createElement("button");
    activateButton.className = "compact-button";
    activateButton.type = "button";
    activateButton.textContent = persona.id === state.activePersonaId ? "On" : "Use";
    activateButton.disabled = persona.id === state.activePersonaId;
    activateButton.addEventListener("click", () => activatePersona(persona.id));

    const editButton = document.createElement("button");
    editButton.className = "compact-button";
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => openEditPersonaEditor(persona));

    const deleteButton = document.createElement("button");
    deleteButton.className = "compact-button is-danger";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.disabled = state.personas.length <= 1;
    deleteButton.addEventListener("click", () => deletePersona(persona.id));

    actions.append(activateButton, editButton, deleteButton);
    card.append(summary, actions);
    elements.personaList.append(card);
  });
}

function buildPersonaMeta(persona) {
  const type = persona.attributes?.partnerType || "partner";
  const tier = persona.attributes?.partnerTier || "standard";
  const region = persona.attributes?.region || "global";

  return `${type} / ${tier} / ${region}`;
}

async function activatePersona(personaId) {
  await performAction(
    { type: ACTIONS.SET_ACTIVE_PERSONA, personaId },
    "Persona applied to active tab.",
    "Switching persona..."
  );
}

async function deletePersona(personaId) {
  const persona = currentState?.personas.find((item) => item.id === personaId);
  const confirmed = window.confirm(`Delete ${persona?.name ?? "this persona"}?`);

  if (!confirmed) {
    return;
  }

  await performAction(
    { type: ACTIONS.DELETE_PERSONA, personaId },
    "Persona deleted.",
    "Deleting persona..."
  );
}

async function setViewMode(viewMode, splitPersonaIds = []) {
  await performAction(
    { type: ACTIONS.SET_VIEW_MODE, viewMode, splitPersonaIds },
    viewMode === VIEW_MODES.SINGLE ? "Single View enabled." : "Split-Screen requested.",
    "Updating view mode..."
  );
}

async function handleSplitViewClick(compareCount) {
  if (!currentState) {
    return;
  }

  const personaIds = currentState.personas.slice(0, compareCount).map((persona) => persona.id);
  if (personaIds.length < compareCount) {
    setStatus(`Create at least ${compareCount} personas to compare ${compareCount} views.`, "error");
    return;
  }

  const viewModeByCount = {
    2: VIEW_MODES.SPLIT,
    3: VIEW_MODES.SPLIT_THREE,
    4: VIEW_MODES.SPLIT_FOUR
  };

  await setViewMode(viewModeByCount[compareCount], personaIds);
}

function openNewPersonaEditor() {
  editingPersonaId = null;
  elements.editorTitle.textContent = "New Persona";
  elements.personaForm.reset();
  renderPicklistControls(personaMetadata);
  elements.personaEditor.hidden = false;
  elements.personaName.focus();
}

function openEditPersonaEditor(persona) {
  editingPersonaId = persona.id;
  elements.editorTitle.textContent = "Edit Persona";
  elements.personaName.value = persona.name ?? "";
  renderPicklistControls(personaMetadata);
  setSelectValue(elements.partnerType, persona.attributes?.partnerType);
  setSelectValue(elements.partnerTier, persona.attributes?.partnerTier);
  setSelectValue(elements.region, persona.attributes?.region);
  elements.personaEditor.hidden = false;
  elements.personaName.focus();
}

function setSelectValue(select, value) {
  if (!value) {
    return;
  }

  if (![...select.options].some((option) => option.value === value)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }

  select.value = value;
}

function closePersonaEditor() {
  editingPersonaId = null;
  elements.personaForm.reset();
  elements.personaEditor.hidden = true;
}

async function handlePersonaSubmit(event) {
  event.preventDefault();

  const formData = new FormData(elements.personaForm);
  const name = String(formData.get("name") ?? "").trim();
  const partnerType = String(formData.get("partnerType") ?? "").trim() || "partner";
  const partnerTier = String(formData.get("partnerTier") ?? "").trim() || "standard";
  const region = String(formData.get("region") ?? "").trim() || "global";
  const metadataFields = personaMetadata?.fields ?? buildFallbackMetadata().fields;

  const persona = {
    id: editingPersonaId ?? name,
    name,
    attributes: {
      partnerType,
      partnerTier,
      region,
      partnerTypeFieldApi: buildQualifiedField(metadataFields.partnerType),
      partnerTierFieldApi: buildQualifiedField(metadataFields.partnerTier),
      regionFieldApi: buildQualifiedField(metadataFields.region)
    },
    simulation: {
      headers: {
        "x-prm-persona-id": editingPersonaId ?? slugify(name),
        "x-prm-partner-type": partnerType,
        "x-prm-partner-tier": partnerTier,
        "x-prm-region": region
      },
      cookies: {
        prm_persona_id: editingPersonaId ?? slugify(name),
        prm_partner_type: partnerType,
        prm_partner_tier: partnerTier,
        prm_region: region
      }
    }
  };

  await performAction(
    { type: ACTIONS.SAVE_PERSONA, persona },
    "Persona saved.",
    "Saving persona..."
  );

  closePersonaEditor();
}

function buildQualifiedField(field) {
  if (!field?.apiName) {
    return "";
  }

  return `${field.objectApiName ?? "Account"}.${field.apiName}`;
}

async function performAction(message, successText, pendingText) {
  setStatus(pendingText);

  try {
    await ensureCurrentOriginAccess(true);
    const response = await sendMessage(message);
    currentState = response.state;
    renderState(currentState);
    setStatus(successText, "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      reject(new Error("Chrome extension runtime is unavailable. Load this folder as an unpacked extension."));
      return;
    }

    chrome.runtime.sendMessage(message, (response) => {
      const runtimeError = chrome.runtime.lastError;

      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error?.message ?? "Extension action failed."));
        return;
      }

      resolve(response);
    });
  });
}

async function ensureCurrentOriginAccess(shouldPrompt) {
  if (typeof chrome === "undefined" || !chrome.tabs?.query || !chrome.permissions) {
    return false;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const originPattern = buildOriginPattern(tab?.url);

  if (!originPattern) {
    return false;
  }

  const hasAccess = await chrome.permissions.contains({ origins: [originPattern] });

  if (!hasAccess && shouldPrompt) {
    const granted = await chrome.permissions.request({ origins: [originPattern] });
    if (!granted) {
      throw new Error("Chrome permission is required for this Salesforce custom domain.");
    }
  }

  if (hasAccess || shouldPrompt) {
    try {
      await sendMessage({ type: ACTIONS.REGISTER_CURRENT_ORIGIN });
    } catch (error) {
      if (!String(error?.message ?? "").includes("Unsupported message type")) {
        throw error;
      }
    }
  }

  return hasAccess || shouldPrompt;
}

function buildOriginPattern(urlValue) {
  try {
    const url = new URL(urlValue);
    if (url.protocol !== "https:") {
      return "";
    }

    return `${url.origin}/*`;
  } catch {
    return "";
  }
}

function setStatus(message, tone = "neutral") {
  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.toggle("is-error", tone === "error");
  elements.statusMessage.classList.toggle("is-success", tone === "success");
}

function buildFallbackMetadata() {
  return {
    source: "fallback",
    fields: {
      partnerType: fieldFromFallback("partnerType"),
      partnerTier: fieldFromFallback("partnerTier"),
      region: fieldFromFallback("region")
    }
  };
}

function fieldFromFallback(key) {
  const field = FALLBACK_PICKLISTS[key];
  return {
    ...field,
    label: field.apiName,
    values: field.values.map((value) => ({ label: value, value }))
  };
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
