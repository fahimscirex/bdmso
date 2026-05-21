# Database

> **Navigation aid.** Schema shapes and field types extracted via AST. Read the actual schema source files before writing migrations or query logic.

**unknown** — 13 models

### member_id_class_seq

- `year`: integer _(required)_
- `class_digit`: integer _(required)_
- `next_seq`: integer _(required)_

### guardian_accounts

pk: `id` (text) · fk: member_id

- `id`: text _(pk)_
- `email`: text _(required)_
- `password_hash`: text _(required)_
- `password_salt`: text _(required)_
- `password_iterations`: integer _(required)_
- `full_name`: text _(required)_
- `phone`: text
- `email_verified`: integer _(required)_
- `member_id`: text _(fk)_
- `role`: text _(required)_

### email_verification_tokens

pk: `token` (text) · fk: account_id

- `token`: text _(pk)_
- `account_id`: text _(required, fk)_
- `expires_at`: text _(required)_

### login_attempts

pk: `id` (integer)

- `id`: integer _(pk)_
- `email`: text _(required)_
- `success`: integer _(required)_
- `attempted_at`: text _(required)_

### registrations

pk: `id` (text) · fk: guardian_account_id

- `id`: text _(pk)_
- `registration_type`: text _(required)_
- `student_full_name`: text _(required)_
- `student_date_of_birth`: text _(required)_
- `student_class_name`: text _(required)_
- `student_gender`: text _(required)_
- `student_medium`: text
- `student_school`: text _(required)_
- `student_district`: text _(required)_
- `guardian_account_id`: text _(required, fk)_
- `guardian_full_name`: text _(required)_
- `guardian_relationship`: text _(required)_
- `guardian_phone`: text _(required)_
- `guardian_email`: text _(required)_
- `guardian_address`: text _(required)_
- `preferred_venue`: text
- `preferred_subject`: text
- `Prep`: course subjects

### sponsorship_enquiries

pk: `id` (text)

- `id`: text _(pk)_
- `organization`: text _(required)_
- `contact_person`: text _(required)_
- `email`: text _(required)_
- `phone`: text
- `interest`: text _(required)_
- `message`: text _(required)_
- `status`: text _(required)_
- `source_page`: text

### sessions

pk: `id` (text) · fk: account_id

- `id`: text _(pk)_
- `account_id`: text _(required, fk)_
- `expires_at`: text _(required)_

### payments

pk: `id` (text) · fk: registration_id, tran_id

- `id`: text _(pk)_
- `registration_id`: text _(required, fk)_
- `amount`: real _(required)_
- `currency`: text _(required)_
- `tran_id`: text _(unique, fk)_

### shurjopay_token_cache

pk: `id` (integer) · fk: store_id

- `id`: integer _(pk)_
- `token`: text _(required)_
- `token_type`: text _(required)_
- `store_id`: text _(required, fk)_
- `expires_at`: text _(required)_

### coupons

pk: `code` (text)

- `code`: text _(pk)_
- `discount_type`: text _(required)_
- `max_uses`: integer
- `applies_to`: text

### admin_audit_log

pk: `id` (text) · fk: account_id

- `id`: text _(pk)_
- `account_id`: text _(required, fk)_
- `action`: text _(required)_
- `payload_json`: text

### programs

pk: `slug` (text)

- `slug`: text _(pk)_
- `title`: text _(required)_
- `tagline`: text
- `cohort`: text
- `image`: text
- `venue`: text
- `audience`: text
- `subjects_json`: text
- `rendered`: at request time
  routine_json text
- `published`: integer _(required)_
- `published_at`: text
- `updated_by`: text

### posts

pk: `slug` (text)

- `slug`: text _(pk)_
- `title`: text _(required)_
- `excerpt`: text
- `category`: text
- `author`: text
- `image`: text
- `rendered`: at request time
  published integer _(required)_
- `featured`: integer _(required)_
- `published_at`: text

## Schema Source Files

Search for ORM schema declarations:
- Drizzle: `pgTable` / `mysqlTable` / `sqliteTable`
- Prisma: `prisma/schema.prisma`
- TypeORM: `@Entity()` decorator
- SQLAlchemy: class inheriting `Base`

---
_Back to [overview.md](./overview.md)_