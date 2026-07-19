(function initializePrmSplitScreen() {
  const ROOT_ID = "prm-persona-split-root";
  const STYLE_ID = "prm-persona-split-style";
  const BADGE_ID = "prm-persona-sandbox-root";

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || event.data?.source !== "prm-extension") {
      return;
    }

    if (event.data.type === "PRM_RENDER_SPLIT_SCREEN") {
      renderSplitScreen(event.data.personaIds);
    }

    if (event.data.type === "PRM_REMOVE_SPLIT_SCREEN") {
      removeSplitScreen();
    }
  });

  function renderSplitScreen(personaIds) {
    if (!Array.isArray(personaIds) || ![2, 3, 4].includes(personaIds.length)) {
      return;
    }

    injectStyles();
    removeSplitScreen();

    const currentUrl = normalizeExperienceCloudUrl(new URL(window.location.href));
    const root = document.createElement("section");
    root.id = ROOT_ID;
    root.setAttribute("aria-label", "PRM split-screen persona comparison");
    root.dataset.compareCount = String(personaIds.length);

    const toolbar = document.createElement("div");
    toolbar.className = "prm-split-toolbar";

    const title = document.createElement("strong");
    title.textContent = "PRM Split-Screen Preview";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", removeSplitScreen);

    toolbar.append(title, closeButton);

    const panes = document.createElement("div");
    panes.className = "prm-split-panes";
    personaIds.forEach((personaId, index) => {
      panes.append(createPane(`Persona ${index + 1}`, personaId, buildPersonaUrl(currentUrl, personaId)));
    });

    root.append(toolbar, panes);
    document.body.style.overflow = "hidden";
    document.documentElement.append(root);

    const badge = document.getElementById(BADGE_ID);
    if (badge) {
      badge.remove();
    }
  }

  function createPane(label, personaId, url) {
    const pane = document.createElement("article");
    pane.className = "prm-split-pane";

    const header = document.createElement("header");
    const title = document.createElement("span");
    title.textContent = `${label}: ${personaId}`;
    header.append(title);

    if (isLikelyFrameBlockedUrl(url)) {
      pane.classList.add("is-blocked");
      const fallback = createBlockedFrameMessage(url);
      pane.append(header, fallback);
      return pane;
    }

    const frame = document.createElement("iframe");
    frame.src = url.toString();
    frame.title = `${label} ${personaId}`;
    frame.referrerPolicy = "strict-origin-when-cross-origin";

    pane.append(header, frame);
    return pane;
  }

  function buildPersonaUrl(currentUrl, personaId) {
    const url = new URL(currentUrl.href);
    url.searchParams.set("prmPersona", personaId);
    url.searchParams.set("prmSplitPreview", "1");
    return url;
  }

  function normalizeExperienceCloudUrl(currentUrl) {
    const url = new URL(currentUrl.href);

    if (url.hostname.endsWith(".builder.salesforce-experience.com")) {
      url.hostname = url.hostname.replace(".builder.salesforce-experience.com", ".my.site.com");
    }

    return url;
  }

  function isLikelyFrameBlockedUrl(url) {
    const hostname = url.hostname;
    return hostname.endsWith(".builder.salesforce-experience.com") ||
      hostname.endsWith(".salesforce-setup.com") ||
      hostname.endsWith(".my.salesforce-setup.com") ||
      hostname.endsWith(".lightning.force.com");
  }

  function createBlockedFrameMessage(url) {
    const fallback = document.createElement("div");
    fallback.className = "prm-frame-fallback";

    const title = document.createElement("strong");
    title.textContent = "This Salesforce page blocks embedded previews";

    const body = document.createElement("p");
    body.textContent = "Open the published Experience Cloud site, then run Split-Screen again. Builder and Setup pages often refuse iframe rendering.";

    const link = document.createElement("a");
    link.href = url.toString();
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Open target page";

    fallback.append(title, body, link);
    return fallback;
  }

  function removeSplitScreen() {
    const existing = document.getElementById(ROOT_ID);
    if (existing) {
      existing.remove();
    }

    document.body.style.overflow = "";
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
        inset: 0;
        z-index: 2147483647;
        display: grid;
        grid-template-rows: 44px 1fr;
        color: #18202f;
        background: #f6f8fb;
        font-family: ui-sans-serif, "Aptos", "Segoe UI", sans-serif;
        letter-spacing: 0;
      }

      #${ROOT_ID} .prm-split-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 0 14px;
        border-bottom: 1px solid #dce2ea;
        background: #ffffff;
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.82) inset;
      }

      #${ROOT_ID} .prm-split-toolbar strong {
        font-size: 13px;
        font-weight: 850;
      }

      #${ROOT_ID} .prm-split-toolbar button {
        height: 30px;
        padding: 0 12px;
        border: 0;
        border-radius: 8px;
        color: #ffffff;
        background: #0c428d;
        font: inherit;
        font-size: 12px;
        font-weight: 850;
        cursor: pointer;
      }

      #${ROOT_ID} .prm-split-panes {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1px;
        min-height: 0;
        background: #c8d1de;
      }

      #${ROOT_ID}[data-compare-count="3"] .prm-split-panes {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      #${ROOT_ID}[data-compare-count="4"] .prm-split-panes {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-template-rows: repeat(2, minmax(0, 1fr));
      }

      #${ROOT_ID} .prm-split-pane {
        display: grid;
        grid-template-rows: 34px 1fr;
        min-width: 0;
        min-height: 0;
        background: #ffffff;
      }

      #${ROOT_ID} .prm-split-pane header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 0 12px;
        border-bottom: 1px solid #dce2ea;
        color: #697386;
        font-size: 12px;
        font-weight: 800;
      }

      #${ROOT_ID} iframe {
        width: 100%;
        height: 100%;
        border: 0;
        background: #ffffff;
      }

      #${ROOT_ID} .prm-split-pane.is-blocked {
        grid-template-rows: 34px 1fr;
      }

      #${ROOT_ID} .prm-frame-fallback {
        display: grid;
        align-content: center;
        justify-items: center;
        gap: 12px;
        padding: 28px;
        color: #18202f;
        text-align: center;
        background:
          linear-gradient(180deg, rgba(18, 94, 201, 0.07), rgba(18, 94, 201, 0)),
          #ffffff;
      }

      #${ROOT_ID} .prm-frame-fallback strong {
        max-width: 360px;
        font-size: 16px;
        line-height: 1.25;
      }

      #${ROOT_ID} .prm-frame-fallback p {
        max-width: 440px;
        margin: 0;
        color: #697386;
        font-size: 13px;
        line-height: 1.45;
      }

      #${ROOT_ID} .prm-frame-fallback a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 34px;
        padding: 0 14px;
        border-radius: 8px;
        color: #ffffff;
        background: #0c428d;
        font-size: 12px;
        font-weight: 850;
        text-decoration: none;
      }
    `;

    document.documentElement.append(style);
  }
})();
