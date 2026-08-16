(() => {
  "use strict";
  for (const form of document.querySelectorAll("form[data-api-form]")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter instanceof HTMLElement ? event.submitter : undefined;
      const data = submitter === undefined ? new FormData(form) : new FormData(form, submitter);
      const button = submitter instanceof HTMLButtonElement ? submitter : form.querySelector("button[type='submit']");
      if (button instanceof HTMLButtonElement) button.disabled = true;
      try {
        const response = await fetch(form.action, { method: form.dataset.method || form.method || "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: new URLSearchParams(data), credentials: "same-origin" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message || "The request could not be completed.");
        const returnField = form.querySelector("input[name='returnTo']");
        location.assign(returnField instanceof HTMLInputElement ? returnField.value : location.href);
      } catch (error) {
        const status = form.querySelector("[data-form-status]");
        if (status instanceof HTMLElement) status.textContent = error instanceof Error ? error.message : "The request could not be completed.";
        else window.alert(error instanceof Error ? error.message : "The request could not be completed.");
        if (button instanceof HTMLButtonElement) button.disabled = false;
      }
    });
  }
})();
