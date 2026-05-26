import { postJson } from "./api.js";
import { BD_DISTRICTS, canonicalDistrict } from "./bd-districts.js";
import { PROGRAM_OPTIONS, programHasOptions, computeOptionsTotal } from "./program-options.js";

// Option ids already taken by another non-cancelled registration on
// this account for the current program. Populated by loadTakenOptions
// when the guardian is signed in (anonymous users skip the lookup
// since the server enforces the same rule on submit anyway).
let takenOptionIds = new Set();
async function loadTakenOptions() {
  let session = null;
  try { session = JSON.parse(localStorage.getItem("bdmso_user") || "null"); } catch {}
  if (!session?.token) return;
  let res;
  try {
    res = await fetch("/api/me", { headers: { Authorization: `Bearer ${session.token}` } });
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

  panel.innerHTML = `
    <div class="opt-head">
      <div class="opt-title">${cfg.label}</div>
      <div class="opt-total"><span class="l">Total</span><span id="opt-total-amount">৳ 0</span></div>
    </div>
    <p class="opt-help">${cfg.help}</p>
    <div class="opt-list">${items}</div>
  `;
  panel.hidden = false;
  panel.querySelectorAll('input[name="program-option"]').forEach((el) => {
    el.addEventListener("change", updateOptionsTotal);
  });
  updateOptionsTotal();
}

function showSubjectField() {
  return effectiveCompetition() === "national-olympiad";
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
}

let currentStep = 1;

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
    field.appendChild(hintEl);
  }
  hintEl.textContent = hint;
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
  const hintEl = field.querySelector(".field-error");
  if (hintEl) hintEl.textContent = "";
}

function clearAllErrors() {
  document.querySelectorAll(".field.is-error").forEach((f) => {
    f.classList.remove("is-error");
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
  "f-subject":  "Select a preferred subject.",
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
      setMessage(`Please pick at least one ${cfg.label.toLowerCase()} option above.`, "error");
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

    if (password.length < 8) {
      markError("account-password", "Password must be at least 8 characters long.");
      document.getElementById("account-password").focus();
      setMessage("Password must be at least 8 characters long.", "error");
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
    if (response.token) {
      localStorage.setItem("bdmso_user", JSON.stringify({
        token: response.token,
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

function init() {
  bindStepControls();
  document.getElementById("submit-registration").addEventListener("click", submitRegistration);
  initDob();

  // The competition is now decided by the URL, not a dropdown - so we
  // just apply the conditional-field visibility once on load. Preferred
  // Subject shows for the Olympiad; Preferred Venue shows for both
  // Olympiad and Quiz.
  syncConditionalFields();
  renderProgramOptions();
  // Async refresh once we know what the guardian already holds (only
  // happens when signed in). The initial render above used the empty
  // default so the form isn't blocked on the round-trip; this just
  // greys out taken slots after the fact.
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
}

// This file is loaded as type="module" which is deferred, so by the
// time it executes DOMContentLoaded may have already fired - check
// readyState to cover both cases.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
