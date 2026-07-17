(function initializePrmPersonaInjector() {
  const ROOT_ID = "prm-persona-sandbox-root";
  const STYLE_ID = "prm-persona-sandbox-style";
  const SPLIT_ROOT_ID = "prm-persona-split-root";

  const state = {
    activePersona: null
  };

  injectStyles();
  requestActivePersona();

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

    const personaName = state.activePersona?.name ?? "No persona";
    const partnerType = state.activePersona?.attributes?.partnerType ?? "partner";
    const partnerTier = state.activePersona?.attributes?.partnerTier ?? "standard";

    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("aside");
      root.id = ROOT_ID;
      root.setAttribute("aria-live", "polite");
      document.documentElement.append(root);
    }

    root.innerHTML = "";

    const label = document.createElement("div");
    label.className = "prm-badge-label";
    label.textContent = "PRM Persona";

    const name = document.createElement("div");
    name.className = "prm-badge-name";
    name.textContent = personaName;

    const meta = document.createElement("div");
    meta.className = "prm-badge-meta";
    meta.textContent = `${partnerType} / ${partnerTier}`;

    root.append(label, name, meta);
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

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        width: 188px;
        padding: 10px 12px;
        border: 1px solid rgba(12, 66, 141, 0.24);
        border-radius: 8px;
        color: #18202f;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 14px 36px rgba(25, 38, 64, 0.18);
        font-family: ui-sans-serif, "Aptos", "Segoe UI", sans-serif;
        letter-spacing: 0;
      }

      #${ROOT_ID} .prm-badge-label {
        color: #007c89;
        font-size: 10px;
        font-weight: 850;
        text-transform: uppercase;
      }

      #${ROOT_ID} .prm-badge-name {
        overflow: hidden;
        margin-top: 3px;
        font-size: 13px;
        font-weight: 850;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${ROOT_ID} .prm-badge-meta {
        overflow: hidden;
        margin-top: 3px;
        color: #697386;
        font-size: 11px;
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `;

    document.documentElement.append(style);
  }
})();
