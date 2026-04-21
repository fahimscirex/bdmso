import { postJson } from "./api.js";

function setStatus(text, kind = "neutral") {
  const node = document.getElementById("sponsorship-status");
  node.textContent = text;
  node.dataset.kind = kind;
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("sponsorship-form");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("", "neutral");

    const submitButton = document.getElementById("sponsorship-submit");
    submitButton.disabled = true;
    submitButton.textContent = "Sending...";

    const payload = {
      organization: document.getElementById("sp-organization").value.trim(),
      contactPerson: document.getElementById("sp-contact").value.trim(),
      email: document.getElementById("sp-email").value.trim(),
      phone: document.getElementById("sp-phone").value.trim(),
      interest: document.getElementById("sp-interest").value,
      message: document.getElementById("sp-message").value.trim(),
      sourcePage: window.location.pathname
    };

    try {
      const response = await postJson("submit-sponsorship", payload);
      form.reset();
      setStatus(`Enquiry received. Reference: ${response.leadId}`, "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Send Enquiry";
    }
  });
});
