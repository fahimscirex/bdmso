# Pending Changes

Sourced from `notes`. Grouped by file. Ready to implement one section at a time.

---

## `public/data/stats.json`

- Remove `{ "value": "100", "unit": "+", "label": "Partner Schools" }`
- Remove `{ "value": "100", "unit": "%", "label": "Prize Winning Rate" }`
- Add `{ "value": "100", "unit": "+", "label": "Volunteers" }`
- Add `{ "value": "5000", "unit": "+", "label": "Students Engaged" }`

---

## `public/data/steps.json` (Road to IMSO dates)

Update all 7 step dates:

| Step | Current date | New date |
|------|-------------|----------|
| Registration | JAN – FEB 2026 | MAY 2026 |
| National Qualifying Round | MAR 2026 | JUNE 2026 |
| National Residential Camp | APR 2026 | JULY 2026 |
| Team Selection Test | MAY 2026 | JULY 2026 |
| IMSO Preparatory Camp | JUN – AUG 2026 | AUG – SEPT 2026 |
| Press Conference | SEP 2026 | OCT 2026 |
| International Participation | OCT 2026 | OCT 2026 |

---

## `public/data/results.json`

- Remove all 4 items from the `"stats"` array (the hall of fame stats block is being removed — see index.html below)

---

## `public/data/programs.json`

- Item 03: change `"description"` — remove "immersive": `"4-hour hands-on lab sessions in Physics, Biology, Chemistry."`
- Item 04: change `"description"` — remove "olympiad": `"Specialised classes on advanced topics."`
- Item 07: rename title `"SPSB Summer Camp"` → `"SPSB Nature Camp"`; change description → `"Activity-based 4-day residential nature camp."`
- Item 08: change description → `"Activity-based international residential camp with global experts and alumni."`
- Add new item: `{ "id": "09", "title": "BdMSO Exchange Program", "description": "30-day international exchange program for top BdMSO students." }`

---

## `public/index.html`

### Hero section (`<!-- SECTION 1: HERO -->`)

- Remove the bottom badge entirely:
  ```html
  <!-- DELETE THIS BLOCK -->
  <div class="hero-badge bot">
    <div class="num">6+6</div>
    <div class="lbl">National team<br>Math &amp; Science</div>
  </div>
  ```
  The top badge (`12/12 Medals IMSO Malaysia 2025`) stays.

### Trust bar (`<!-- SECTION 2: TRUST BAR -->`)

- Change heading text from `"Your journey to IMSO begins here"` → `"Your journey all the way to representing Bangladesh on the international stage."`

### About section (`<!-- SECTION 3: ABOUT -->`)

- Change `<h2>` from:
  `Bangladesh's gateway to the International Math &amp; Science Olympiad.`
  → `Gateway to the International Math &amp; Science Olympiad.`

- Replace both `<p>` tags inside `.about-text` with:
  ```html
  <p>Bangladesh Mathematics and Science Olympiad (BdMSO) is designed to introduce primary school students to the world of mathematics and science from an early age, nurturing their natural curiosity and problem-solving skills.</p>
  <p>BdMSO serves as the official qualifying platform to select primary school students (up to Grade 6) to represent Bangladesh internationally. Each year, the competition selects a national team of twelve students — six for Mathematics and six for Science — to participate in the International Mathematics and Science Olympiad (IMSO). In 2026, the 23rd IMSO will be held in Indonesia.</p>
  ```

- In `.about-highlights`, change:
  `<div class="n">Est. 2017</div>` → `<div class="n">Since 2025</div>`

### Road to IMSO (`<!-- SECTION 4: ROAD TO IMSO -->`)

- Change `<p>` description from:
  `"Seven carefully designed stages — from your first registration all the way to representing Bangladesh on the international stage."`
  → `"Your journey all the way to representing Bangladesh on the international stage."`

### Hall of Fame (`<!-- SECTION 5: HALL OF FAME -->`)

- Change section heading from `"Faces of Bangladesh at IMSO."` → `"Faces of Bangladesh."`
- Change subheading/description to: `"We celebrate winners and every student's ranking."`
- Remove the stats block: `<div class="fame-stats" id="fame-stats"></div>`
- Replace the `fame-grid` cards with a **photo slider** (group photos). The slider should:
  - Show one group photo at a time with prev/next arrows
  - Display a caption below each photo
  - Replace the individual portrait cards (`fame-card`) entirely

### Programs section (`<!-- SECTION 8: PROGRAMS -->`)

- Change `<h2>` from:
  `"Year-round programs for your child's STEM development."`
  → `"A journey for building foundation in science, technology, engineering, and mathematics."`

### Start Guide (`<!-- SECTION 9: START GUIDE -->`)

- Change section `<h2>` from `"Where should your child begin?"`
  → `"Unlock your child's potential in math and science."`

- Beginner level card — add two items to `<ul>`:
  - `<li>SPSB Nature Camp</li>`
  - `<li>STEM Masterclass Series</li>`
  (Add after existing items)

- Open for All card — change `<p>` from:
  `"Immersive camps open to all children who love science."`
  → `"Activity-based camps open to all children who love science."`
  
  Update `<ul>` items:
  - `"SPSB Summer Camp"` → `"SPSB Nature Camp"`
  - `"International Winter Camp"` stays

---

## `public/programs.html`

### Page heading

- Change `<h1>` from:
  `"Year-round programs for your child's STEM development."`
  → `"A journey for building foundation in science, technology, engineering, and mathematics."`

### STEM Foundation Program (article 01)

- Duration: `"12 weeks"` → `"24 classes"`
- Outcome: `"Ready for BdMSO Prep"` → `"Building foundation"`

### BdMSO Preparatory Course (article 02)

- Who it's for: `"Class 4–6"` → `"Class 3 to 5"`
- Duration: `"16 weeks"` → `"12 classes"`
- Description (oneliner): change to `"Preparatory course for the national round — advanced problem-solving and structured training."`

### STEM Masterclass Series (article 03)

- Duration: `"8 sessions"` → `"4 classes"`
- Description: `"Specialised classes on advanced olympiad topics"` → `"Specialised classes on advanced topics — from number theory to experimental design."`

### Mock Test Program (article 04)

- Duration: `"6 tests"` → `"Monthly (1 per month)"`

### Lab Day Workshop (article 05)

- Description: remove "immersive": `"4-hour laboratory sessions for hands-on learning in Physics, Biology, and Chemistry."`

### Robotics Foundation Course (article 06)

- Duration: `"10 weeks"` → `"12 classes"`

### SPSB Summer Camp (article 07)

- Rename: `"SPSB Summer Camp"` → `"SPSB Nature Camp"`
- Description: `"An adventurous residential camp focused on hands-on science, nature, and math-based games."` → `"Activity-based 4-day residential nature camp with hands-on science and outdoor learning."`
- Duration: `"5 days residential"` → `"4 days residential"`

### International Winter Camp (article 08)

- Description → `"Activity-based international residential camp featuring mentorship from global experts and alumni."`
- Duration: `"10 days residential"` → `"5 days residential"`

### New: BdMSO Exchange Program (add as article 09)

Add after article 08:
```html
<article class="p-item" data-tags="open">
  <div class="visual"><span class="lvl">Open · Exchange</span><div class="ph">[ Exchange program ]</div></div>
  <div>
    <span class="eyebrow" style="font-size:10px; padding:3px 8px;">09 · Exchange</span>
    <h3 style="margin-top:10px;">BdMSO Exchange Program</h3>
    <p class="oneliner">A 30-day international exchange for top BdMSO students — collaborative learning with peers from across the world.</p>
    <div class="p-meta">
      <div><div class="k">Who it's for</div><div class="v">Top BdMSO students</div></div>
      <div><div class="k">Duration</div><div class="v">30 days</div></div>
      <div><div class="k">Outcome</div><div class="v">International exposure</div></div>
    </div>
  </div>
  <div class="p-cta"><div class="price">৳ On enquiry</div><a class="btn btn-primary" href="registration.html">Apply</a><a class="btn btn-link" href="#">Details</a></div>
</article>
```

---

## `public/resources.html`

### Syllabus panel (`#syllabus`)

- Change description `<p>` from:
  `"A short summary of the math and science topics covered at the National Round and TST."`
  → `"Math and Science syllabus with downloadable topic list."`
- Update download link `href="#"` → `href="downloads/syllabus.pdf"` (placeholder path, update when file is ready)

### Regulations panel (`#regulations`)

- Change description `<p>` from:
  `"Official eligibility rules, exam conduct, and BdMSO code of honour."`
  → `"Official eligibility rules, exam conduct, and BdMSO code of conduct."`
- Update download link `href="#"` → `href="downloads/regulations.pdf"` (placeholder path)
- Remove bullet: `"The Top 15 TST finalists receive portal notifications; declining students are replaced from the next eligible."`
- Remove bullet: `"The final IMSO delegation is confirmed after logistics and airfare are settled."`

### Mark Distribution panel (`#marks`)

- Remove the TST column entirely. Simplify table to National Round only:

```html
<table class="marks-table">
  <thead><tr><th>Section</th><th>National Round</th><th>Time</th></tr></thead>
  <tbody>
    <tr><td>Multiple Choice</td><td class="num" data-label="National">20 × 2 = 40</td><td data-label="Time">45 min</td></tr>
    <tr><td>Short Answer</td><td class="num" data-label="National">10 × 4 = 40</td><td data-label="Time">60 min</td></tr>
    <tr><td>Problem Solving</td><td class="num" data-label="National">2 × 10 = 20</td><td data-label="Time">75 min</td></tr>
    <tr><td><strong>Total</strong></td><td class="num" data-label="National"><strong>100</strong></td><td data-label="Time"><strong>—</strong></td></tr>
  </tbody>
</table>
```

### Previous Year Questions → Sample Questions (panel `#papers`)

- Rename panel heading from `"Previous Year Questions"` → `"Sample Questions"`
- Change nav link text from `"Previous Year Questions"` → `"Sample Questions"`
- Replace description from `"Year-wise archive of both BdMSO and IMSO official papers."` → `"Sample questions to practice for the National Qualifying Round."`
- Replace the `year-card` archive grid with subject-based sample question cards:
  ```html
  <div class="archive">
    <div class="year-card"><div class="yr">Math</div><div style="font-size:13px; color:var(--ink-3);">National Round</div><div class="links"><a href="#">⬇ Sample Paper (Math)</a></div></div>
    <div class="year-card"><div class="yr">Science</div><div style="font-size:13px; color:var(--ink-3);">National Round</div><div class="links"><a href="#">⬇ Sample Paper (Science)</a></div></div>
  </div>
  ```

### Guide for Parents panel (`#parents`)

- Remove the `"Time commitment"` guide item entirely.
- Add a new guide item in its place:
  ```html
  <div class="guide-item">
    <h4>Explore Programs</h4>
    <p>From foundation courses to residential camps — browse all year-round programs to find the right fit for your child. <a href="programs.html" style="color:var(--navy-700); text-decoration:underline;">View all programs →</a></p>
  </div>
  ```

### Nav sidebar

- Update `"Previous Year Questions"` → `"Sample Questions"` in `<li>` anchor text

---

## `public/registration.html`

### National Qualifying Round card

- Change `"Closes May 15, 2026"` → `"Closes May 30, 2026"`

### Team Selection Test card

- Remove entire card:
  ```html
  <!-- DELETE -->
  <div class="reg-card locked"><span class="status locked-s">🔒 Locked</span><h3>Team Selection Test (TST)</h3>...</div>
  ```

### IMSO Participation card

- Change description from `"Requires qualification through the National Round."` → `"Requires qualification through TST."`
- Remove `"Logistics and airfare managed centrally."` sentence.

### Step 1 — Student Info form

- Add gender field after the Class field:
  ```html
  <div class="field"><label>Gender</label>
    <select id="f-gender"><option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select>
  </div>
  ```

---

## `public/js/registration.js`

- Add `{ id: "f-gender", label: "Gender" }` to the `fields` array
- Add `"f-gender"` to the `requiredByStep[1]` array
- Add `["Gender", valueOf("f-gender") || "—"]` to `fillSummary()` rows
- Add `gender: valueOf("f-gender")` to `registrationPayload()` under `student`

---

## `worker/index.js`

- In `handleRegistration`: add `const studentGender = requireField(student.gender, "Gender");`
- Add `student_gender` to the `INSERT INTO registrations` column list and bind args
- In `handleMe` query: add `r.student_gender` to the SELECT

---

## `db/schema.sql` + new migration

- Add column: `student_gender TEXT NOT NULL` to `registrations` table
- Create `db/migrations/007_add_student_gender.sql`:
  ```sql
  ALTER TABLE registrations ADD COLUMN student_gender TEXT NOT NULL DEFAULT '';
  ```

---

## `public/team.html`

- Find and remove the paragraph beginning with `"BdMSO has sent a national…"` — located in the International Team Delegation panel description (currently: `"Portraits and credentials of our 6+6 national team, team leader, and travelling mentors."` — verify if additional text follows this or if this sentence is the one to remove)
- Change `"6+6"` references in team.html → `"12"` (6 Math + 6 Science = 12 total)

---

## New files to create

### `public/terms.html`
- New Terms & Conditions page
- Update registration form T&C checkbox link: `href="resources.html"` → `href="terms.html"`
- Content sections: Eligibility, Registration & Fees, Payment Policy, Code of Conduct, Data & Privacy, Contact

### `public/forgot-password.html`
- Email input form ("Enter your account email to receive a reset link")
- Link from `login.html`: add `"Forgot password?"` link below sign-in button

### Backend for forgot password (`worker/index.js`)
- New table `password_reset_tokens (token, account_id, expires_at, created_at)`
- `POST /api/forgot-password` — validates email, creates token, sends reset email via Brevo
- `POST /api/reset-password` — validates token, accepts new password, clears token

### New migration for reset tokens
- `db/migrations/008_password_reset_tokens.sql`

---

## Coupons (full feature)

### DB
- New table: `coupons (code TEXT PK, discount_type TEXT, discount_value REAL, max_uses INTEGER, uses INTEGER, expires_at TEXT, active INTEGER)`
- Migration: `db/migrations/009_coupons.sql`

### Backend (`worker/index.js`)
- `POST /api/validate-coupon` — checks code validity, returns discount info
- Update `handleCreatePayment` — accept optional `couponCode`, apply discount to `amount`

### Frontend (`public/dashboard.html`)
- Add coupon code input + "Apply" button in the payment flow (before the "Pay Now" button or as a modal step)

---

## `public/index.html` — Resource cards (Section 6)

Update the two broken `href` values so they deep-link into the resources page:
- Regulations card: `href="resources.html"` → `href="resources.html#regulations"`
- Syllabus card: `href="resources.html"` → `href="resources.html#syllabus"`

---

## User registration edit window

Allow users to edit their registration info within a set time period after submission.

### Backend
- `PUT /api/registration` — requires auth, checks `created_at` is within edit window (e.g. 24h), updates allowed fields (student info, guardian info — not status/member_id)

### Frontend (`public/dashboard.html`)
- Show "Edit" button on reg cards where `status === 'submitted'` and within edit window
- Clicking opens an edit modal/form pre-filled with current data

---

## Summary: simple edits vs. larger features

**Simple text/data edits** (do first, low risk):
- stats.json, steps.json, results.json, programs.json
- index.html: hero badge, about text, headings, start guide
- programs.html: all duration/description/rename changes
- resources.html: syllabus desc, code of conduct fix, remove TST column, sample questions, remove time commitment
- registration.html: date, remove TST card, IMSO description, gender field

**Medium complexity** (needs frontend + backend wiring):
- Gender field (registration.js + worker + DB migration)
- Hall of Fame slider (index.html + home.js)
- Edit registration window (worker + dashboard)
- Coupons (worker + dashboard + DB)

**Larger features** (plan separately):
- Forgot password (new page + backend + email + DB)
- Terms & Conditions page
