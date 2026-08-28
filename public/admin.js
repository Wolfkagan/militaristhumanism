(() => {
  "use strict";

  function internalDestination(value) {
    if (
      typeof value !== "string" ||
      !value.startsWith("/") ||
      value.startsWith("//") ||
      value.includes("\\") ||
      /[\u0000-\u001F\u007F]/u.test(value)
    ) {
      return null;
    }
    try {
      const destination = new URL(value, location.origin);
      return destination.origin === location.origin ? destination : null;
    } catch {
      return null;
    }
  }

  function navigateWithinSite(value) {
    const destination = internalDestination(value);
    if (destination === null) {
      location.reload();
      return;
    }
    location.assign(destination.href);
  }

  for (const form of document.querySelectorAll("form[data-api-form]")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter instanceof HTMLElement ? event.submitter : undefined;
      const data = submitter === undefined ? new FormData(form) : new FormData(form, submitter);
      const button = submitter instanceof HTMLButtonElement ? submitter : form.querySelector("button[type='submit']");
      if (button instanceof HTMLButtonElement) button.disabled = true;
      try {
        const endpoint = form.getAttribute("action");
        if (!endpoint) throw new Error("The form endpoint is unavailable.");
        const response = await fetch(endpoint, { method: form.dataset.method || form.getAttribute("method") || "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: new URLSearchParams(data), credentials: "same-origin" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message || "The request could not be completed.");
        const returnField = form.querySelector("input[name='returnTo']");
        navigateWithinSite(returnField instanceof HTMLInputElement ? returnField.value : null);
      } catch (error) {
        const status = form.querySelector("[data-form-status]");
        if (status instanceof HTMLElement) status.textContent = error instanceof Error ? error.message : "The request could not be completed.";
        else window.alert(error instanceof Error ? error.message : "The request could not be completed.");
        if (button instanceof HTMLButtonElement) button.disabled = false;
      }
    });
  }
})();
