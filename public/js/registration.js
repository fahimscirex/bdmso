import { postJson } from "./api.js";
import { BD_DISTRICTS, canonicalDistrict } from "./bd-districts.js";
import { PROGRAM_OPTIONS, programHasOptions, computeOptionsTotal, initProgramOptions } from "./program-options.js";

// Option ids already taken by another non-cancelled registration on
// this account for the current program. Populated by loadTakenOptions
// when the guardian is signed in (anonymous users skip the lookup
// since the server enforces the same rule on submit anyway).
let takenOptionIds = new Set();
async function loadTakenOptions() {
  let session = null;
  try { session = JSON.parse(localStorage.getItem("bdmso_user") || "null"); } catch {}
  if (!session) return;
  let res;
  try {
    const headers = session.token ? { Authorization: `Bearer ${session.token}` } : {};
    res = await fetch("/api/me", { headers, credentials: "same-origin" });
  } catch { return; }
  if (!res.ok) return;
  let data;
  try { data = await res.json(); } catch { return; }
  const slug = effectiveCompetition();
  const ids = new Set();
  for (const r of (data.registrations || [])) {
    if (r.registration_type !== slug) continue;
    if (r.status === "cancelled") continue;
    try {
      const v = JSON.parse(r.program_options || "[]");
      if (Array.isArray(v)) for (const id of v) if (typeof id === "string") ids.add(id);
    } catch {}
  }
  takenOptionIds = ids;
}

const TITLES = {
  1: "Step 1 · Student Info",
  2: "Step 2 · Guardian Info",
  3: "Step 3 · Confirmation"
};

const fields = [
  { id: "f-name", label: "Student" },
  { id: "f-medium", label: "Curriculum" },
  { id: "f-class", label: "Class" },
  { id: "f-gender", label: "Gender" },
  { id: "f-dob", label: "Date of Birth" },
  { id: "f-school", label: "School" },
  { id: "f-district", label: "District" },
  { id: "f-subject", label: "Preferred Subject" },
  { id: "f-venue", label: "Exam Region" },
  { id: "g-name", label: "Guardian" },
  { id: "g-rel", label: "Relationship" },
  { id: "g-phone", label: "Mobile" },
  { id: "g-email", label: "Email" },
  { id: "g-addr", label: "Address" }
];

// The program a guardian is registering for is now always decided by
// the ?program= URL parameter (the in-form Competition dropdown was
// removed). Falls back to the Olympiad so /registration without a
// program param still produces a valid payload.
function effectiveCompetition() {
  return new URLSearchParams(location.search).get("program") || "national-olympiad";
}

function showVenueField() {
  const comp = effectiveCompetition();
  return comp === "national-olympiad" || comp === "national-quiz-competition";
}

// ─── Program options ──────────────────────────────────────────────
// Reads PROGRAM_OPTIONS (shared with the worker) and renders the
// option picker into #program-options-panel. Picks are stored in the
// DOM only; we read them back into the payload at submit time.
function getSelectedOptions() {
  const inputs = document.querySelectorAll('#program-options-panel input[name="program-option"]:checked');
  return Array.from(inputs).map((el) => el.value);
}

function updateOptionsTotal() {
  const slug = effectiveCompetition();
  const total = computeOptionsTotal(slug, getSelectedOptions());
  const totalEl = document.getElementById("opt-total-amount");
  if (totalEl) totalEl.textContent = total > 0 ? `৳ ${total.toLocaleString("en-BD")}` : `৳ 0`;
  // Update checked-card visual state.
  document.querySelectorAll("#program-options-panel .opt-item").forEach((label) => {
    const input = label.querySelector('input[name="program-option"]');
    label.classList.toggle("is-checked", !!(input && input.checked));
  });
}

function renderProgramOptions() {
  const panel = document.getElementById("program-options-panel");
  if (!panel) return;
  const slug = effectiveCompetition();
  if (!programHasOptions(slug)) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  const cfg = PROGRAM_OPTIONS[slug];
  const inputType = cfg.kind === "radio" ? "radio" : "checkbox";
  // Items the guardian already holds elsewhere render disabled with an
  // "Already enrolled" hint - the server enforces the same rule on
  // submit, but flagging them up-front keeps users from picking a
  // taken slot and getting a 409 back.
  const items = cfg.items.map((it) => {
    const taken = takenOptionIds.has(it.id);
    return `
    <label class="opt-item${taken ? ' opt-taken' : ''}" data-id="${it.id}">
      <input type="${inputType}" name="program-option" value="${it.id}"${taken ? ' disabled' : ''}>
      <div class="opt-text">
        <div class="opt-label-row">
          <span class="opt-label">${it.label}${taken ? ' · Already enrolled' : ''}</span>
          <span class="opt-price">৳ ${it.price.toLocaleString("en-BD")}</span>
        </div>
        ${it.sub ? `<div class="opt-sub">${it.sub}</div>` : ""}
      </div>
    </label>`;
  }).join("");

  // The catalog options config may omit label/help - fall back so the header
  // never shows the literal "undefined".
  const optTitle = cfg.label || "Select an option";
  panel.innerHTML = `
    <div class="opt-head">
      <div class="opt-title">${optTitle}</div>
      <div class="opt-total"><span class="l">Total</span><span id="opt-total-amount">৳ 0</span></div>
    </div>
    ${cfg.help ? `<p class="opt-help">${cfg.help}</p>` : ""}
    <div class="opt-list">${items}</div>
  `;
  panel.hidden = false;
  panel.querySelectorAll('input[name="program-option"]').forEach((el) => {
    el.addEventListener("change", updateOptionsTotal);
    // Picking an option may have just satisfied the step 1 gate;
    // refresh the Continue button immediately. The conditional fields
    // (Preferred Subject for Olympiad's "both") also depend on the
    // picked option, so re-evaluate visibility too.
    el.addEventListener("change", () => {
      syncConditionalFields();
      if (typeof refreshStepButtons === "function") refreshStepButtons();
    });
  });
  updateOptionsTotal();
  if (typeof refreshStepButtons === "function") refreshStepButtons();
}

// Preferred Subject is only meaningful when a student registers for BOTH
// Olympiad subjects. Picking math-only or science-only already declares
// the subject, so the field is hidden in those cases.
function showSubjectField() {
  if (effectiveCompetition() !== "national-olympiad") return false;
  return getSelectedOptions().includes("both");
}

const SUBJECT_LABEL = {
  math: "Mathematics",
  science: "Science",
  both: "Both (Math + Science)"
};

// Show or hide the conditional fields and keep the actual <select> state
// in sync (clearing the subject value when the field hides so a stale
// pick from a previous selection doesn't leak into the submitted payload).
function syncConditionalFields() {
  const subjectField = document.getElementById("field-subject");
  const subjectInput = document.getElementById("f-subject");
  const venueField   = document.getElementById("field-venue");
  if (subjectField) {
    const visible = showSubjectField();
    subjectField.hidden = !visible;
    if (!visible && subjectInput) subjectInput.value = "";
  }
  if (venueField) venueField.hidden = !showVenueField();
  // Conditional fields just changed - the required-label markers and
  // step button state may need to follow. Both helpers are idempotent.
  if (typeof markRequiredLabels === "function") markRequiredLabels();
  if (typeof refreshStepButtons === "function") refreshStepButtons();
}

let currentStep = 1;

// The registration id returned by submit-registration. Needed by the
// step-4 "Pay now" action so it can create a payment for the newly
// created registration without another round-trip.
let createdRegistrationId = null;

function valueOf(id) {
  return document.getElementById(id).value.trim();
}

function setMessage(text, kind = "neutral") {
  const node = document.getElementById("form-message");
  node.textContent = text;
  node.dataset.kind = kind;
}

// Per-field error helpers. `markError` flips a field into the red
// invalid state with an inline hint; `clearError` removes it. We also
// auto-clear on first input/change so the red state doesn't linger
// once the guardian starts fixing the field.
function markError(id, hint) {
  const el = document.getElementById(id);
  if (!el) return;
  const field = el.closest(".field");
  if (!field) return;
  field.classList.add("is-error");
  let hintEl = field.querySelector(".field-error");
  if (!hintEl) {
    hintEl = document.createElement("span");
    hintEl.className = "field-error";
    hintEl.id = `${id}-error`;
    hintEl.setAttribute("role", "alert");
    field.appendChild(hintEl);
  }
  hintEl.textContent = hint;
  // Announce the failure to assistive tech and link the field to its hint.
  el.setAttribute("aria-invalid", "true");
  el.setAttribute("aria-describedby", hintEl.id);
  if (!el.dataset.errorBound) {
    const clear = () => clearError(id);
    el.addEventListener("input", clear);
    el.addEventListener("change", clear);
    el.dataset.errorBound = "1";
  }
}

function clearError(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const field = el.closest(".field");
  if (!field) return;
  field.classList.remove("is-error");
  el.removeAttribute("aria-invalid");
  el.removeAttribute("aria-describedby");
  const hintEl = field.querySelector(".field-error");
  if (hintEl) hintEl.textContent = "";
}

function clearAllErrors() {
  document.querySelectorAll(".field.is-error").forEach((f) => {
    f.classList.remove("is-error");
    f.querySelectorAll("[aria-invalid]").forEach((el) => {
      el.removeAttribute("aria-invalid");
      el.removeAttribute("aria-describedby");
    });
    const hintEl = f.querySelector(".field-error");
    if (hintEl) hintEl.textContent = "";
  });
}

// Field-specific labels so the inline hint reads naturally, rather
// than the generic "This field is required."
const REQUIRED_HINT = {
  "f-name":     "Enter the student's full name.",
  "f-dob":      "Pick the student's date of birth.",
  "f-medium":   "Select a curriculum.",
  "f-class":    "Select the student's class.",
  "f-gender":   "Select a gender.",
  "f-school":   "Enter the school name.",
  "f-district": "Select a district.",
  "f-subject":  "Pick which subject to prioritise.",
  "f-venue":    "Select an exam region.",
  "g-name":     "Enter the guardian's full name.",
  "g-rel":      "Select the guardian's relationship.",
  "g-phone":    "Enter a 10-digit Bangladesh mobile number (after +880).",
  "g-email":    "Enter the guardian's email address.",
  "g-addr":     "Enter the guardian's address.",
  "account-password":         "Set a password for the account.",
  "account-password-confirm": "Re-enter the password to confirm.",
};

function validateStep(step) {
  clearAllErrors();

  const requiredByStep = {
    1: ["f-name", "f-dob", "f-medium", "f-class", "f-gender", "f-school", "f-district"],
    2: ["g-name", "g-rel", "g-phone", "g-email", "g-addr"],
    3: ["account-password", "account-password-confirm"]
  };

  const requiredFields = [...(requiredByStep[step] || [])];
  // Preferred subject is required only when the Olympiad is selected.
  if (step === 1 && showSubjectField()) requiredFields.push("f-subject");
  // Exam venue is required for Olympiad and Quiz (the only programs
  // where it's shown).
  if (step === 1 && showVenueField()) requiredFields.push("f-venue");

  // Program options (Mock Test sessions / Prep Course subjects).
  // Required on step 1 when the program has options configured.
  if (step === 1 && programHasOptions(effectiveCompetition())) {
    const picked = getSelectedOptions();
    if (picked.length === 0) {
      const cfg = PROGRAM_OPTIONS[effectiveCompetition()];
      setMessage(`Please pick at least one ${(cfg.label || "").toLowerCase()} option above.`.replace(/\s+/g, " ").trim(), "error");
      document.querySelector('#program-options-panel input[name="program-option"]')?.focus();
      return false;
    }
  }

  // First pass: flag every empty required field at once (so users can
  // see the full picture instead of fixing them one error at a time),
  // then focus the first one and stop here.
  const missing = requiredFields.filter((id) => !document.getElementById(id).value.trim());
  if (missing.length) {
    missing.forEach((id) => markError(id, REQUIRED_HINT[id] || "This field is required."));
    document.getElementById(missing[0]).focus();
    const count = missing.length === 1 ? "1 required field" : `${missing.length} required fields`;
    setMessage(`Please fill in ${count} highlighted below before continuing.`, "error");
    return false;
  }

  // District must be one of the 64 Bangladesh districts (case-insensitive).
  // Normalises the entered value to canonical case on success so the
  // payload always carries a clean, consistent string.
  if (step === 1) {
    const districtEl = document.getElementById("f-district");
    const canon = canonicalDistrict(districtEl.value);
    if (!canon) {
      markError("f-district", "Pick one of the 64 Bangladesh districts from the list.");
      districtEl.focus();
      setMessage("District must match one of the 64 Bangladesh districts.", "error");
      return false;
    }
    districtEl.value = canon;
  }

  if (step === 2) {
    const email = valueOf("g-email");
    const phone = valueOf("g-phone");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      markError("g-email", "Enter a valid email address (name@example.com).");
      document.getElementById("g-email").focus();
      setMessage("Enter a valid email address for the guardian account.", "error");
      return false;
    }

    // Phone input only accepts the 10 digits after +880 (typical BD
    // mobile is +880 1XXXXXXXXX). The prefix is rendered as a static
    // chip in the UI but isn't part of the input value.
    if (!/^\d{10}$/.test(phone)) {
      markError("g-phone", "Enter exactly 10 digits (the part after +880).");
      document.getElementById("g-phone").focus();
      setMessage("Enter a valid guardian phone number.", "error");
      return false;
    }
  }

  if (step === 3) {
    const password = valueOf("account-password");
    const confirm = valueOf("account-password-confirm");

    if (!PWD_RULES.length(password)) {
      markError("account-password", "Password must be at least 8 characters long.");
      document.getElementById("account-password").focus();
      setMessage("Password must be at least 8 characters long.", "error");
      return false;
    }
    if (!PWD_RULES.letter(password) || !PWD_RULES.number(password)) {
      markError("account-password", "Include at least one letter and one number.");
      document.getElementById("account-password").focus();
      setMessage("Password must include at least one letter and one number.", "error");
      return false;
    }

    if (password !== confirm) {
      markError("account-password-confirm", "This must match the password above.");
      document.getElementById("account-password-confirm").focus();
      setMessage("Password confirmation does not match.", "error");
      return false;
    }

    if (!document.getElementById("terms").checked) {
      setMessage("You must agree to the Rules & Regulations and Terms & Conditions before submitting.", "error");
      return false;
    }
  }

  setMessage("", "neutral");
  return true;
}

// Pretty labels for the registrationType slugs we might show in the
// review summary. The slug itself is the fallback when a new program
// is added without a label here yet.
const COMPETITION_LABEL = {
  "national-olympiad":          "BdMSO National Olympiad",
  "national-quiz-competition":  "BdMSO Quiz Competition",
};

// f-dob holds an ISO yyyy-mm-dd string composed from the three DOB
// selects; the review summary shows it as dd/mm/yyyy.
function formatDob(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fillSummary() {
  const curriculumLabels = {
    national:      "National (Bangla or English version)",
    international: "International (English Medium)"
  };
  const comp = effectiveCompetition();
  const rows = [
    ["Competition", COMPETITION_LABEL[comp] || comp || "-"],
    ["Student", valueOf("f-name") || "-"],
    ["Curriculum", curriculumLabels[valueOf("f-medium")] || valueOf("f-medium") || "-"],
    ["Class", valueOf("f-class") || "-"],
    ["Gender", valueOf("f-gender") || "-"],
    ["Date of Birth", formatDob(valueOf("f-dob"))],
    ["School", valueOf("f-school") || "-"],
    ["District", valueOf("f-district") || "-"],
    ...(showSubjectField() ? [["Preferred Subject", SUBJECT_LABEL[valueOf("f-subject")] || valueOf("f-subject") || "-"]] : []),
    ...(showVenueField() ? [["Exam Region", valueOf("f-venue") || "-"]] : []),
    ["Guardian", `${valueOf("g-name") || "-"} (${valueOf("g-rel") || "-"})`],
    ["Mobile", valueOf("g-phone") ? `+880${valueOf("g-phone")}` : "-"],
    ["Email", valueOf("g-email") || "-"]
  ];

  // Build the summary with createElement + textContent instead of an
  // innerHTML template. Values are guardian-typed form fields (school,
  // name, etc.); a value like `<img src=x onerror=...>` typed into
  // any field would otherwise execute as soon as the user clicked
  // Review. textContent is XSS-immune by design.
  const grid = document.getElementById("summary-grid");
  grid.replaceChildren(...rows.map(([key, val]) => {
    const cell = document.createElement("div");
    const k = document.createElement("div");
    k.className = "k";
    k.textContent = key;
    const v = document.createElement("div");
    v.className = "v";
    v.textContent = val;
    cell.append(k, v);
    return cell;
  }));
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
    registrationType: effectiveCompetition(),
    student: {
      fullName: valueOf("f-name"),
      dateOfBirth: valueOf("f-dob"),
      medium: valueOf("f-medium"),
      className: valueOf("f-class"),
      gender: valueOf("f-gender"),
      school: valueOf("f-school"),
      district: valueOf("f-district"),
      ...(showSubjectField() ? { preferredSubject: valueOf("f-subject") } : {}),
      ...(showVenueField() ? { preferredVenue: valueOf("f-venue") } : {})
    },
    guardian: {
      fullName: valueOf("g-name"),
      relationship: valueOf("g-rel"),
      // Input collects only the 10 digits after the rendered "+880"
      // prefix - we restore the full international form here so the
      // worker (and DB) always store the canonical number.
      phone: `+880${valueOf("g-phone")}`,
      email: valueOf("g-email"),
      address: valueOf("g-addr")
    },
    account: {
      password: valueOf("account-password")
    },
    termsAccepted: document.getElementById("terms").checked,
    sourcePage: window.location.pathname,
    // Programs with selectable options (Mock Test, Prep Course)
    // carry the picks - server validates + derives price.
    ...(programHasOptions(effectiveCompetition()) ? { programOptions: getSelectedOptions() } : {})
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
    if (response.accountId) {
      localStorage.setItem("bdmso_user", JSON.stringify({
        accountId: response.accountId,
        fullName: response.fullName,
        email: response.email
      }));
    }
    const memberIdEl = document.getElementById("member-id");
    if (memberIdEl) memberIdEl.textContent = response.memberId || "";
    document.getElementById("account-email").textContent = valueOf("g-email");
    // Carry the new registration id onto the "Go to dashboard" button
    // so the dashboard can scroll the guardian straight to the new
    // Pay Now card instead of leaving them at the top of the list.
    const dashLink = document.getElementById("success-dashboard-link");
    if (dashLink && response.applicationId) {
      dashLink.href = `/dashboard?focus=${encodeURIComponent(response.applicationId)}`;
    }
    createdRegistrationId = response.applicationId || null;
    if (window.fbq) window.fbq("track", "CompleteRegistration");
    setStep(4);
    setMessage("", "neutral");
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Submit & Create Account →";
  }
}

// Step-4 "Pay now" action. Lets the guardian pick the online gateway
// (shurjoPay, default) or a manual / cash flow, then creates a payment
// for the freshly created registration. On a manual response the server
// returns a printable invoice url we redirect to; on online it returns
// the shurjoPay checkout url. The server still requires a verified email,
// so an unverified guardian gets a clear inline error here.
async function payNow() {
  const status = document.getElementById("pay-status");
  if (!createdRegistrationId) {
    if (status) { status.textContent = "Registration not found. Please use the dashboard to pay."; status.dataset.kind = "error"; }
    return;
  }
  let session = null;
  try { session = JSON.parse(localStorage.getItem("bdmso_user") || "null"); } catch {}
  const checked = document.querySelector('input[name="pay-method"]:checked');
  const paymentMethod = checked ? checked.value : "online";

  const button = document.getElementById("pay-now-btn");
  button.disabled = true;
  button.textContent = "Starting payment...";
  if (status) { status.textContent = ""; status.dataset.kind = "neutral"; }

  try {
    const response = await postJson(
      "create-payment",
      { registrationId: createdRegistrationId, paymentMethod },
      session?.token
    );
    if (response.manual && response.invoiceUrl) {
      location.href = response.invoiceUrl;
      return;
    }
    if (response.checkoutURL) {
      if (window.fbq) window.fbq("track", "InitiateCheckout");
      location.href = response.checkoutURL;
      return;
    }
    // A 0-fee registration completes server-side with no redirect.
    if (status) { status.textContent = "Payment complete. Redirecting to your dashboard..."; status.dataset.kind = "success"; }
    location.href = `/dashboard?focus=${encodeURIComponent(createdRegistrationId)}`;
  } catch (error) {
    if (status) { status.textContent = error.message; status.dataset.kind = "error"; }
    button.disabled = false;
    button.textContent = "Pay now →";
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

// ─── Date of Birth ────────────────────────────────────────────────
// A native <input type="date"> renders mm/dd/yyyy on US-locale
// browsers. To guarantee dd/mm/yyyy we use a Day number input, a Month
// select and a Year number input (number inputs avoid the very tall
// native dropdown a 31-option day <select> produces). The three
// compose an ISO yyyy-mm-dd value into the hidden #f-dob input that
// the rest of the form (validation, payload, summary) already reads.
const DOB_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(year, month) {
  if (!month) return 31;
  if (month === 2) return year ? new Date(year, 2, 0).getDate() : 29;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function initDob() {
  const dayEl = document.getElementById("f-dob-day");
  const monthEl = document.getElementById("f-dob-month");
  const yearEl = document.getElementById("f-dob-year");
  const hidden = document.getElementById("f-dob");
  if (!dayEl || !monthEl || !yearEl || !hidden) return;

  monthEl.innerHTML = '<option value="">Month</option>' +
    DOB_MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");

  // Generous year bounds - covers any plausible primary-school student.
  const thisYear = new Date().getFullYear();
  yearEl.min = String(thisYear - 20);
  yearEl.max = String(thisYear - 3);

  function syncHidden() {
    const d = Number(dayEl.value);
    const m = Number(monthEl.value);
    const y = Number(yearEl.value);
    // Cap the day input to the real length of the chosen month.
    dayEl.max = String(daysInMonth(y, m));
    const valid = d >= 1 && m >= 1 && m <= 12 && y >= 1900 && d <= daysInMonth(y, m);
    hidden.value = valid
      ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      : "";
    // Fire change so the existing per-field error auto-clear hook runs.
    hidden.dispatchEvent(new Event("change"));
  }

  dayEl.addEventListener("input", syncHidden);
  monthEl.addEventListener("change", syncHidden);
  yearEl.addEventListener("input", syncHidden);
}

// ─── Live validation primitives ───────────────────────────────────
// These run as the guardian types/blurs - separate from validateStep,
// which is the gate fired on Continue/Submit. The blur handler shows
// an error immediately for format-bound fields (email, phone, password
// rules); the input handlers feed isStepValid() which decides whether
// the Continue/Submit button is enabled.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PWD_RULES = {
  length: (v) => v.length >= 8,
  letter: (v) => /[a-zA-Z]/.test(v),
  number: (v) => /\d/.test(v),
};

function requiredFieldsForStep(step) {
  const base = {
    1: ["f-name", "f-dob", "f-medium", "f-class", "f-gender", "f-school", "f-district"],
    2: ["g-name", "g-rel", "g-phone", "g-email", "g-addr"],
    3: ["account-password", "account-password-confirm"],
  };
  const ids = [...(base[step] || [])];
  if (step === 1 && showSubjectField()) ids.push("f-subject");
  if (step === 1 && showVenueField())   ids.push("f-venue");
  return ids;
}

// Boolean version of validateStep with no side-effects on the DOM,
// used for live button enable/disable. Mirrors the rules in
// validateStep but only returns true/false.
function isStepValid(step) {
  const ids = requiredFieldsForStep(step);
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el || !el.value.trim()) return false;
  }
  if (step === 1 && programHasOptions(effectiveCompetition()) && getSelectedOptions().length === 0) return false;
  if (step === 1) {
    const districtVal = document.getElementById("f-district")?.value || "";
    if (districtVal && !canonicalDistrict(districtVal)) return false;
  }
  if (step === 2) {
    if (!EMAIL_RE.test(valueOf("g-email"))) return false;
    if (!/^\d{10}$/.test(valueOf("g-phone"))) return false;
  }
  if (step === 3) {
    const pwd     = valueOf("account-password");
    const confirm = valueOf("account-password-confirm");
    if (!PWD_RULES.length(pwd) || !PWD_RULES.letter(pwd) || !PWD_RULES.number(pwd)) return false;
    if (pwd !== confirm) return false;
    if (!document.getElementById("terms")?.checked) return false;
  }
  return true;
}

// Append a small red asterisk after a label when the field is required.
// Skips the conditional ones (subject/venue) - those get marked on
// the fly by syncConditionalFields().
function markRequiredLabels() {
  const labelText = (el) => el?.closest(".field")?.querySelector("label");
  const ensureStar = (label) => {
    if (!label || label.querySelector(".req")) return;
    const star = document.createElement("span");
    star.className = "req";
    star.setAttribute("aria-hidden", "true");
    star.textContent = "*";
    label.appendChild(star);
  };
  for (const step of [1, 2, 3]) {
    for (const id of requiredFieldsForStep(step)) {
      // f-dob is a hidden composite input; mark the visible field group instead.
      const target = id === "f-dob" ? document.getElementById("field-dob") : document.getElementById(id);
      const label  = id === "f-dob" ? target?.querySelector("label") : labelText(target);
      ensureStar(label);
    }
  }
  // Terms checkbox label gets a star too - it's a required gate to submit.
  const terms = document.querySelector('label[for="terms"]');
  if (terms && !terms.querySelector(".req")) ensureStar(terms);
}

// Re-evaluate every step's Continue/Submit + status text. Cheap to run
// on every input event; only touches button.disabled + text.
function refreshStepButtons() {
  const map = [
    { step: 1, btn: "step-1-next",         status: "step-1-status" },
    { step: 2, btn: "step-2-next",         status: "step-2-status" },
    { step: 3, btn: "submit-registration", status: "step-3-status" },
  ];
  for (const { step, btn, status } of map) {
    const button = document.getElementById(btn);
    const statusEl = document.getElementById(status);
    if (!button) continue;
    const valid = isStepValid(step);
    button.disabled = !valid;
    if (statusEl) {
      if (valid) {
        statusEl.textContent = "";
        statusEl.classList.remove("is-warn");
      } else {
        statusEl.textContent = stepMissingHint(step);
        statusEl.classList.add("is-warn");
      }
    }
  }
}

// Short, human-readable summary of what's still missing on a step.
function stepMissingHint(step) {
  const missing = requiredFieldsForStep(step).filter((id) => !document.getElementById(id)?.value.trim());
  if (step === 1 && programHasOptions(effectiveCompetition()) && getSelectedOptions().length === 0) {
    return "Pick an option above to continue.";
  }
  if (missing.length > 0) {
    return missing.length === 1
      ? "Complete the highlighted field to continue."
      : `Fill in ${missing.length} more required fields to continue.`;
  }
  if (step === 2) {
    if (!EMAIL_RE.test(valueOf("g-email"))) return "Enter a valid email to continue.";
    if (!/^\d{10}$/.test(valueOf("g-phone"))) return "Enter a 10-digit mobile number.";
  }
  if (step === 3) {
    const pwd = valueOf("account-password");
    if (!PWD_RULES.length(pwd) || !PWD_RULES.letter(pwd) || !PWD_RULES.number(pwd))
      return "Set a password that meets every rule.";
    if (pwd !== valueOf("account-password-confirm"))
      return "Re-enter the same password to confirm.";
    if (!document.getElementById("terms")?.checked)
      return "Tick the Terms checkbox to enable submission.";
  }
  return "";
}

// Tick off password rules live. Called on every keystroke in the
// password field.
function refreshPwdChecklist() {
  const pwd = document.getElementById("account-password")?.value || "";
  for (const rule of Object.keys(PWD_RULES)) {
    const row = document.querySelector(`.pwd-rule[data-rule="${rule}"]`);
    if (!row) continue;
    row.classList.toggle("is-pass", PWD_RULES[rule](pwd));
  }
}

// Address character counter. Soft warns at 90%, hard caps at the
// textarea's maxlength.
function refreshAddrCounter() {
  const el = document.getElementById("g-addr");
  const counter = document.getElementById("g-addr-counter");
  if (!el || !counter) return;
  const max = Number(el.getAttribute("maxlength")) || 240;
  const len = el.value.length;
  counter.textContent = `${len} / ${max}`;
  counter.classList.toggle("is-near", len >= max * 0.9 && len < max);
  counter.classList.toggle("is-at",   len >= max);
}

// Pre-fill guardian email/name from the session when the guardian is
// signed in but lands on the full-form path (no existing student row).
// Doesn't try to overwrite anything the user has already typed.
function prefillFromSession() {
  let session = null;
  try { session = JSON.parse(localStorage.getItem("bdmso_user") || "null"); } catch {}
  if (!session) return;
  const emailEl = document.getElementById("g-email");
  const nameEl  = document.getElementById("g-name");
  if (emailEl && !emailEl.value && session.email)    emailEl.value = session.email;
  if (nameEl  && !nameEl.value  && session.fullName) nameEl.value  = session.fullName;
}

// Blur validators: fire immediately when the user leaves a format-bound
// field so they don't discover the problem at submit time.
function bindBlurValidators() {
  const emailEl = document.getElementById("g-email");
  if (emailEl) emailEl.addEventListener("blur", () => {
    const v = emailEl.value.trim();
    if (v && !EMAIL_RE.test(v)) markError("g-email", "Enter a valid email address (name@example.com).");
  });
  const phoneEl = document.getElementById("g-phone");
  if (phoneEl) phoneEl.addEventListener("blur", () => {
    const v = phoneEl.value.trim();
    if (v && !/^\d{10}$/.test(v)) markError("g-phone", "Enter exactly 10 digits (the part after +880).");
  });
  const pwdEl = document.getElementById("account-password");
  if (pwdEl) pwdEl.addEventListener("blur", () => {
    const v = pwdEl.value;
    if (!v) return;
    if (!PWD_RULES.length(v)) markError("account-password", "Password must be at least 8 characters long.");
    else if (!PWD_RULES.letter(v) || !PWD_RULES.number(v))
      markError("account-password", "Include at least one letter and one number.");
  });
  const confirmEl = document.getElementById("account-password-confirm");
  if (confirmEl) confirmEl.addEventListener("blur", () => {
    if (confirmEl.value && confirmEl.value !== (pwdEl?.value || ""))
      markError("account-password-confirm", "This must match the password above.");
  });
  const districtEl = document.getElementById("f-district");
  if (districtEl) districtEl.addEventListener("blur", () => {
    const v = districtEl.value.trim();
    if (v && !canonicalDistrict(v))
      markError("f-district", "Pick one of the 64 Bangladesh districts from the list.");
  });
}

// Bind input/change to refresh button states + checklists live.
function bindLiveRefresh() {
  const watched = [
    "f-name", "f-dob", "f-medium", "f-class", "f-gender", "f-school", "f-district", "f-subject", "f-venue",
    "g-name", "g-rel", "g-phone", "g-email", "g-addr",
    "account-password", "account-password-confirm", "terms",
  ];
  for (const id of watched) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener("input",  refreshStepButtons);
    el.addEventListener("change", refreshStepButtons);
  }
  document.getElementById("account-password")?.addEventListener("input", refreshPwdChecklist);
  document.getElementById("g-addr")?.addEventListener("input", refreshAddrCounter);
  document.getElementById("program-options-panel")?.addEventListener("change", refreshStepButtons);
}

function init() {
  bindStepControls();
  document.getElementById("submit-registration").addEventListener("click", submitRegistration);
  document.getElementById("pay-now-btn")?.addEventListener("click", payNow);
  initDob();

  // Offline/cash payment can be turned off by admins. When it's off, hide that
  // option and force the online radio (the server rejects manual anyway).
  fetch("/api/settings", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((cfg) => {
      if (cfg && cfg.offlinePaymentEnabled === false) {
        const manual = document.getElementById("pay-opt-manual");
        if (manual) manual.hidden = true;
        const online = document.querySelector('input[name="pay-method"][value="online"]');
        if (online) online.checked = true;
      }
    })
    .catch(() => {});

  // The competition is now decided by the URL, not a dropdown - so we
  // just apply the conditional-field visibility once on load. Preferred
  // Subject shows for the Olympiad; Preferred Venue shows for both
  // Olympiad and Quiz.
  syncConditionalFields();
  renderProgramOptions();
  // PROGRAM_OPTIONS is populated ASYNCHRONOUSLY from the catalog (the shared
  // helper, also used by registration-page.js). The render above runs before
  // that resolves, so the picker starts empty - for NEW (signed-out) users it
  // would otherwise never appear and Continue could never be satisfied. Re-render
  // and re-gate once the catalog has loaded. initProgramOptions() is cached, so
  // this shares the same fetch.
  initProgramOptions().then(() => {
    renderProgramOptions();
    syncConditionalFields();
    refreshStepButtons();
  });
  // Async refresh once we know what the guardian already holds (only
  // happens when signed in). Greys out slots they already have; the render
  // reads the up-to-date PROGRAM_OPTIONS so it's safe whenever it resolves.
  loadTakenOptions().then(() => {
    if (takenOptionIds.size > 0) renderProgramOptions();
  });

  // Populate the District <select>. A real select (native picker on
  // mobile) is reliable everywhere - the datalist typeahead it replaced
  // showed nothing while typing on mobile and accepted any text.
  const districtSelect = document.getElementById("f-district");
  if (districtSelect && districtSelect.options.length <= 1) {
    districtSelect.insertAdjacentHTML(
      "beforeend",
      BD_DISTRICTS.map((d) => `<option value="${d}">${d}</option>`).join(""),
    );
  }

  // Phone input: enforce digit-only + 10-char max as the user types and
  // on paste. The +880 prefix is rendered as a static chip in the form,
  // not part of the input value - we add it back when building the
  // submission payload.
  const phoneEl = document.getElementById("g-phone");
  if (phoneEl) {
    const sanitise = (v) => v.replace(/\D+/g, "").slice(0, 10);
    phoneEl.addEventListener("input", () => {
      const clean = sanitise(phoneEl.value);
      if (clean !== phoneEl.value) phoneEl.value = clean;
    });
    phoneEl.addEventListener("paste", (e) => {
      const text = (e.clipboardData || window.clipboardData)?.getData("text") || "";
      const digits = text.replace(/\D+/g, "");
      // If the pasted value carries the country code, drop it so the
      // 10-digit subscriber number is what lands in the field.
      const trimmed = digits.startsWith("880") ? digits.slice(3) : digits;
      e.preventDefault();
      phoneEl.value = trimmed.slice(0, 10);
      phoneEl.dispatchEvent(new Event("input"));
    });
  }

  // Name inputs: allow letters, spaces, hyphens, apostrophes and dots
  // only - digits and other characters are stripped as the user types.
  ["f-name", "g-name"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      const clean = el.value.replace(/[^\p{L}\s'.-]/gu, "");
      if (clean !== el.value) el.value = clean;
    });
  });

  // UX layer: required-field markers, live button gating, blur
  // validation, password checklist, address char counter, and session
  // pre-fill. Each helper is idempotent so it's safe to call once on
  // init and again whenever syncConditionalFields fires for a program
  // that newly shows/hides Subject/Venue.
  markRequiredLabels();
  prefillFromSession();
  bindBlurValidators();
  bindLiveRefresh();
  refreshPwdChecklist();
  refreshAddrCounter();
  refreshStepButtons();
}

// This file is loaded as type="module" which is deferred, so by the
// time it executes DOMContentLoaded may have already fired - check
// readyState to cover both cases.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
