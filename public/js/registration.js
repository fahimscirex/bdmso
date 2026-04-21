import { postJson } from "./api.js";

const TITLES = {
  1: "Step 1 · Student Info",
  2: "Step 2 · Guardian Info",
  3: "Step 3 · Confirmation"
};

const fields = [
  { id: "f-name", label: "Student" },
  { id: "f-class", label: "Class" },
  { id: "f-dob", label: "Date of Birth" },
  { id: "f-school", label: "School" },
  { id: "f-city", label: "City" },
  { id: "g-name", label: "Guardian" },
  { id: "g-rel", label: "Relationship" },
  { id: "g-phone", label: "Mobile" },
  { id: "g-email", label: "Email" },
  { id: "g-addr", label: "Address" }
];

let currentStep = 1;

function valueOf(id) {
  return document.getElementById(id).value.trim();
}

function setMessage(text, kind = "neutral") {
  const node = document.getElementById("form-message");
  node.textContent = text;
  node.dataset.kind = kind;
}

function validateStep(step) {
  const requiredByStep = {
    1: ["f-name", "f-dob", "f-class", "f-school", "f-city"],
    2: ["g-name", "g-rel", "g-phone", "g-email", "g-addr"],
    3: ["account-password", "account-password-confirm"]
  };

  const requiredFields = requiredByStep[step] || [];

  for (const id of requiredFields) {
    const element = document.getElementById(id);
    const value = element.value.trim();
    if (!value) {
      element.focus();
      setMessage("Please complete all required fields before continuing.", "error");
      return false;
    }
  }

  if (step === 2) {
    const email = valueOf("g-email");
    const phone = valueOf("g-phone");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      document.getElementById("g-email").focus();
      setMessage("Enter a valid email address for the guardian account.", "error");
      return false;
    }

    if (phone.length < 8) {
      document.getElementById("g-phone").focus();
      setMessage("Enter a valid guardian phone number.", "error");
      return false;
    }
  }

  if (step === 3) {
    const password = valueOf("account-password");
    const confirm = valueOf("account-password-confirm");

    if (password.length < 8) {
      document.getElementById("account-password").focus();
      setMessage("Password must be at least 8 characters long.", "error");
      return false;
    }

    if (password !== confirm) {
      document.getElementById("account-password-confirm").focus();
      setMessage("Password confirmation does not match.", "error");
      return false;
    }

    if (!document.getElementById("terms").checked) {
      setMessage("You must confirm the rules and regulations before submitting.", "error");
      return false;
    }
  }

  setMessage("", "neutral");
  return true;
}

function fillSummary() {
  const rows = [
    ["Student", valueOf("f-name") || "—"],
    ["Class", valueOf("f-class") || "—"],
    ["Date of Birth", valueOf("f-dob") || "—"],
    ["School", valueOf("f-school") || "—"],
    ["City", valueOf("f-city") || "—"],
    ["Guardian", `${valueOf("g-name") || "—"} (${valueOf("g-rel") || "—"})`],
    ["Mobile", valueOf("g-phone") || "—"],
    ["Email", valueOf("g-email") || "—"]
  ];

  document.getElementById("summary-grid").innerHTML = rows
    .map(([key, val]) => `<div><div class="k">${key}</div><div class="v">${val}</div></div>`)
    .join("");
}

function setStep(step) {
  currentStep = step;

  for (let i = 1; i <= 4; i += 1) {
    document.getElementById(`step-${i}`).hidden = i !== step;
  }

  if (step <= 3) {
    document.getElementById("step-title").textContent = TITLES[step];
    document.getElementById("step-count").textContent = `${step} / 3`;
  }

  document.querySelectorAll(".progress .bar").forEach((bar, index) => {
    const progressStep = index + 1;
    bar.classList.remove("active", "done");
    if (progressStep < step) {
      bar.classList.add("done");
    } else if (progressStep === step) {
      bar.classList.add("active");
    }
  });

  if (step === 3) {
    fillSummary();
  }

  document.getElementById("form").scrollIntoView({ behavior: "smooth", block: "start" });
}

function registrationPayload() {
  return {
    registrationType: "national-qualifying-round",
    student: {
      fullName: valueOf("f-name"),
      dateOfBirth: valueOf("f-dob"),
      className: valueOf("f-class"),
      school: valueOf("f-school"),
      city: valueOf("f-city")
    },
    guardian: {
      fullName: valueOf("g-name"),
      relationship: valueOf("g-rel"),
      phone: valueOf("g-phone"),
      email: valueOf("g-email"),
      address: valueOf("g-addr")
    },
    account: {
      password: valueOf("account-password")
    },
    termsAccepted: document.getElementById("terms").checked,
    sourcePage: window.location.pathname
  };
}

async function submitRegistration() {
  if (!validateStep(3)) {
    return;
  }

  const button = document.getElementById("submit-registration");
  button.disabled = true;
  button.textContent = "Submitting...";
  setMessage("Creating the account and saving the registration...", "neutral");

  try {
    const response = await postJson("submit-registration", registrationPayload());
    document.getElementById("application-id").textContent = response.applicationId;
    document.getElementById("account-email").textContent = valueOf("g-email");
    setStep(4);
    setMessage("", "neutral");
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Submit & Create Account →";
  }
}

function bindStepControls() {
  document.querySelectorAll("[data-next-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetStep = Number(button.dataset.nextStep);
      if (validateStep(currentStep)) {
        setStep(targetStep);
      }
    });
  });

  document.querySelectorAll("[data-prev-step]").forEach((button) => {
    button.addEventListener("click", () => {
      setStep(Number(button.dataset.prevStep));
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindStepControls();
  document.getElementById("submit-registration").addEventListener("click", submitRegistration);
});
