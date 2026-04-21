function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function badRequest(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function requireField(value, label) {
  const normalized = normalizeString(value);
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPhoneLike(value) {
  return normalizeString(value).replace(/[^\d+]/g, "").length >= 8;
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 120000,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  return toHex(derivedBits);
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

async function handleRegistration(request, env) {
  const payload = await parseJson(request);
  const student = payload.student || {};
  const guardian = payload.guardian || {};
  const account = payload.account || {};

  const studentFullName = requireField(student.fullName, "Student full name");
  const studentDateOfBirth = requireField(student.dateOfBirth, "Date of birth");
  const studentClassName = requireField(student.className, "Class");
  const studentSchool = requireField(student.school, "School");
  const studentCity = requireField(student.city, "City");
  const guardianFullName = requireField(guardian.fullName, "Guardian name");
  const guardianRelationship = requireField(guardian.relationship, "Relationship");
  const guardianPhone = requireField(guardian.phone, "Phone");
  const guardianEmail = requireField(guardian.email, "Guardian email").toLowerCase();
  const guardianAddress = requireField(guardian.address, "Address");
  const password = requireField(account.password, "Password");
  const registrationType = normalizeString(payload.registrationType) || "national-qualifying-round";
  const sourcePage = normalizeString(payload.sourcePage);
  const termsAccepted = Boolean(payload.termsAccepted);

  if (!termsAccepted) {
    return badRequest("Rules and regulations must be accepted.");
  }

  if (!isEmail(guardianEmail)) {
    return badRequest("Guardian email is not valid.");
  }

  if (!isPhoneLike(guardianPhone)) {
    return badRequest("Guardian phone number is not valid.");
  }

  if (password.length < 8) {
    return badRequest("Password must be at least 8 characters long.");
  }

  const existingAccount = await env.DB.prepare(
    "SELECT id FROM guardian_accounts WHERE email = ? LIMIT 1"
  ).bind(guardianEmail).first();

  if (existingAccount) {
    return badRequest("An account already exists for that email. Use a different email or contact support.", 409);
  }

  const guardianAccountId = createId("ga");
  const applicationId = createId("app");
  const createdAt = new Date().toISOString();
  const passwordSalt = crypto.randomUUID();
  const passwordHash = await hashPassword(password, passwordSalt);

  const statements = [
    env.DB.prepare(
      `INSERT INTO guardian_accounts (
        id, email, password_hash, password_salt, full_name, phone, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      guardianAccountId,
      guardianEmail,
      passwordHash,
      passwordSalt,
      guardianFullName,
      guardianPhone,
      createdAt
    ),
    env.DB.prepare(
      `INSERT INTO registrations (
        id, registration_type, student_full_name, student_date_of_birth, student_class_name,
        student_school, student_city, guardian_account_id, guardian_full_name,
        guardian_relationship, guardian_phone, guardian_email, guardian_address,
        terms_accepted, status, source_page, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      applicationId,
      registrationType,
      studentFullName,
      studentDateOfBirth,
      studentClassName,
      studentSchool,
      studentCity,
      guardianAccountId,
      guardianFullName,
      guardianRelationship,
      guardianPhone,
      guardianEmail,
      guardianAddress,
      termsAccepted ? 1 : 0,
      "submitted",
      sourcePage,
      createdAt
    )
  ];

  await env.DB.batch(statements);

  return jsonResponse({
    ok: true,
    applicationId
  });
}

async function handleSponsorship(request, env) {
  const payload = await parseJson(request);
  const organization = requireField(payload.organization, "Organization");
  const contactPerson = requireField(payload.contactPerson, "Contact person");
  const email = requireField(payload.email, "Email").toLowerCase();
  const phone = normalizeString(payload.phone);
  const interest = requireField(payload.interest, "Interested in");
  const message = requireField(payload.message, "Message");
  const sourcePage = normalizeString(payload.sourcePage);

  if (!isEmail(email)) {
    return badRequest("Email address is not valid.");
  }

  const leadId = createId("lead");

  await env.DB.prepare(
    `INSERT INTO sponsorship_enquiries (
      id, organization, contact_person, email, phone, interest, message, status, source_page, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    leadId,
    organization,
    contactPerson,
    email,
    phone,
    interest,
    message,
    "new",
    sourcePage,
    new Date().toISOString()
  ).run();

  return jsonResponse({
    ok: true,
    leadId
  });
}

async function handleApi(request, env, pathname) {
  if (request.method !== "POST") {
    return badRequest("Method not allowed.", 405);
  }

  try {
    if (pathname === "/api/submit-registration") {
      return await handleRegistration(request, env);
    }

    if (pathname === "/api/submit-sponsorship") {
      return await handleSponsorship(request, env);
    }

    return badRequest("Not found.", 404);
  } catch (error) {
    return badRequest(error.message || "The request could not be completed.");
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url.pathname);
    }

    return env.ASSETS.fetch(request);
  }
};
