(function initializePrmPersonaInjector() {
  const ROOT_ID = "prm-persona-sandbox-root";
  const STYLE_ID = "prm-persona-sandbox-style";
  const SPLIT_ROOT_ID = "prm-persona-split-root";
  const CUSTOM_ORIGINS_KEY = "prm_custom_salesforce_origins";

  const STANDARD_SALESFORCE_HOSTS = Object.freeze([
    "force.com",
    "my.site.com",
    "salesforce-sites.com",
    "salesforce.com",
    "my.salesforce.com",
    "salesforce-setup.com",
    "my.salesforce-setup.com"
  ]);

  const state = {
    activePersona: null
  };

  initialize();

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === "PRM_ACTIVE_PERSONA_CHANGED") {
      state.activePersona = message.payload?.persona ?? null;
      renderBadge();
    }

    if (message.type === "PRM_SPLIT_SCREEN_REQUESTED") {
      requestSplitScreen(message.payload?.personaIds ?? []);
    }

    if (message.type === "PRM_SINGLE_VIEW_REQUESTED") {
      removeSplitScreen();
      renderBadge();
    }
  });

  async function initialize() {
    if (!(await isSupportedPage())) {
      removeInjectedUi();
      return;
    }

    requestActivePersona();
  }

  async function isSupportedPage() {
    const { hostname, protocol, origin } = window.location;

    if (protocol === "https:" && STANDARD_SALESFORCE_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
      return true;
    }

    if (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1")) {
      return true;
    }

    if (protocol === "https:") {
      const stored = await chrome.storage.local.get(CUSTOM_ORIGINS_KEY);
      const origins = Array.isArray(stored[CUSTOM_ORIGINS_KEY]) ? stored[CUSTOM_ORIGINS_KEY] : [];
      return origins.includes(origin);
    }

    return false;
  }

  function removeInjectedUi() {
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(SPLIT_ROOT_ID)?.remove();
    document.documentElement.removeAttribute("data-prm-persona-id");
    document.documentElement.removeAttribute("data-prm-partner-type");
    document.documentElement.removeAttribute("data-prm-partner-tier");
  }

  function requestActivePersona() {
    chrome.runtime.sendMessage({ type: "PRM_GET_ACTIVE_PERSONA" }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        return;
      }

      state.activePersona = response.persona ?? null;
      renderBadge();
    });
  }

  function renderBadge() {
    if (document.getElementById(SPLIT_ROOT_ID)) {
      return;
    }

    const partnerType = state.activePersona?.attributes?.partnerType ?? "partner";
    const partnerTier = state.activePersona?.attributes?.partnerTier ?? "standard";

    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    document.documentElement.dataset.prmPersonaId = state.activePersona?.id ?? "";
    document.documentElement.dataset.prmPartnerType = partnerType;
    document.documentElement.dataset.prmPartnerTier = partnerTier;
  }

  function requestSplitScreen(personaIds) {
    if (!Array.isArray(personaIds) || ![2, 3, 4].includes(personaIds.length)) {
      return;
    }

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("src/content/split-screen.js");
    script.onload = () => {
      script.remove();
      window.postMessage(
        {
          source: "prm-extension",
          type: "PRM_RENDER_SPLIT_SCREEN",
          personaIds
        },
        window.location.origin
      );
    };

    document.documentElement.append(script);
  }

  function removeSplitScreen() {
    window.postMessage(
      {
        source: "prm-extension",
        type: "PRM_REMOVE_SPLIT_SCREEN"
      },
      window.location.origin
    );
  }

})();
