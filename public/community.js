(() => {
  "use strict";

  const forms = document.querySelectorAll("form[data-api-form]");
  for (const form of forms) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = form.querySelector("[data-form-status]");
      const submitter = event.submitter instanceof HTMLElement ? event.submitter : undefined;
      const data = submitter === undefined ? new FormData(form) : new FormData(form, submitter);
      const button = submitter instanceof HTMLButtonElement ? submitter : form.querySelector("button[type='submit']");
      if (button instanceof HTMLButtonElement) button.disabled = true;
      if (status instanceof HTMLElement) status.textContent = "Working…";
      try {
        const endpoint = form.getAttribute("action");
        if (!endpoint) throw new Error("The form endpoint is unavailable.");
        const response = await fetch(endpoint, {
          method: form.dataset.method || form.getAttribute("method") || "POST",
          headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: new URLSearchParams(data),
          credentials: "same-origin",
        });
        const payload = await response.json();
        if (!response.ok) {
          if (response.status === 401) {
            location.assign(`/community/sign-in?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
            return;
          }
          throw new Error(payload?.error?.message || "The request could not be completed.");
        }
        const draftKey = form.dataset.draftKey;
        if (draftKey) localStorage.removeItem(`mh-draft:${draftKey}`);
        const returnField = form.querySelector("input[name='returnTo']");
        const destination = payload?.thread?.path || (returnField instanceof HTMLInputElement ? returnField.value : location.href);
        location.assign(destination || location.href);
      } catch (error) {
        if (status instanceof HTMLElement) status.textContent = error instanceof Error ? error.message : "The request could not be completed.";
        if (button instanceof HTMLButtonElement) button.disabled = false;
      }
    });
  }

  for (const composer of document.querySelectorAll(".composer")) {
    const input = composer.querySelector("[data-markdown-input]");
    const preview = composer.querySelector("[data-markdown-preview]");
    const writeButton = composer.querySelector("[data-composer-write]");
    const previewButton = composer.querySelector("[data-composer-preview]");
    const counter = composer.querySelector("[data-counter]");
    const form = composer.closest("form");
    if (!(input instanceof HTMLTextAreaElement) || !(preview instanceof HTMLElement) || !(form instanceof HTMLFormElement)) continue;
    const maximum = Number(input.maxLength || 0);
    const updateCounter = () => {
      if (counter instanceof HTMLElement) counter.textContent = `${input.value.length.toLocaleString()} / ${maximum.toLocaleString()}`;
    };
    const key = form.dataset.draftKey;
    if (key) {
      const saved = localStorage.getItem(`mh-draft:${key}`);
      if (saved && !input.value) input.value = saved;
      input.addEventListener("input", () => localStorage.setItem(`mh-draft:${key}`, input.value));
    }
    input.addEventListener("input", updateCounter);
    updateCounter();
    writeButton?.addEventListener("click", () => {
      input.hidden = false;
      preview.hidden = true;
      writeButton.setAttribute("aria-pressed", "true");
      previewButton?.setAttribute("aria-pressed", "false");
      input.focus();
    });
    previewButton?.addEventListener("click", async () => {
      const csrf = form.querySelector("input[name='csrf']");
      const body = new URLSearchParams({ body: input.value, csrf: csrf instanceof HTMLInputElement ? csrf.value : "" });
      preview.textContent = "Rendering preview…";
      preview.hidden = false;
      input.hidden = true;
      writeButton?.setAttribute("aria-pressed", "false");
      previewButton.setAttribute("aria-pressed", "true");
      try {
        const response = await fetch("/api/community/preview", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body, credentials: "same-origin" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message || "Preview unavailable.");
        preview.innerHTML = payload.rendered;
      } catch (error) {
        preview.textContent = error instanceof Error ? error.message : "Preview unavailable.";
      }
    });
  }

  for (const button of document.querySelectorAll("[data-reply-to]")) {
    button.addEventListener("click", () => {
      const form = document.querySelector(".reply-composer form");
      if (!(form instanceof HTMLFormElement)) return;
      let field = form.querySelector("input[name='parentPublicId']");
      if (!(field instanceof HTMLInputElement)) {
        field = document.createElement("input");
        field.type = "hidden";
        field.name = "parentPublicId";
        form.append(field);
      }
      field.value = button.dataset.replyTo || "";
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      form.querySelector("textarea")?.focus();
    });
  }

  document.querySelector("[data-copy-link]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;
    try {
      await navigator.clipboard.writeText(location.href);
      button.textContent = "Link copied";
    } catch {
      button.textContent = "Copy unavailable";
    }
  });
})();
