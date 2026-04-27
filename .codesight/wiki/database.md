# Database

> **Navigation aid.** Schema shapes and field types extracted via AST. Read the actual schema source files before writing migrations or query logic.

**unknown** — 8 models

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

### member_id_seq

pk: `id` (integer)

- `id`: integer _(pk)_
- `reserved_at`: text _(required)_

### guardian_accounts

pk: `id` (text)

- `id`: text _(pk)_
- `email`: text _(required)_
- `password_hash`: text _(required)_
- `password_salt`: text _(required)_
- `password_iterations`: integer _(required)_
- `full_name`: text _(required)_
- `phone`: text
- `email_verified`: integer _(required)_

### registrations

pk: `id` (text) · fk: member_id, guardian_account_id

- `id`: text _(pk)_
- `member_id`: text _(unique, fk)_
- `registration_type`: text _(required)_
- `student_full_name`: text _(required)_
- `student_date_of_birth`: text _(required)_
- `student_class_name`: text _(required)_
- `student_school`: text _(required)_
- `student_city`: text _(required)_
- `guardian_account_id`: text _(required, fk)_
- `guardian_full_name`: text _(required)_
- `guardian_relationship`: text _(required)_
- `guardian_phone`: text _(required)_
- `guardian_email`: text _(required)_
- `guardian_address`: text _(required)_
- `terms_accepted`: integer _(required)_
- `status`: text _(required)_
- `source_page`: text

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

pk: `id` (text) · fk: registration_id, account_id, tran_id, val_id

- `id`: text _(pk)_
- `registration_id`: text _(required, fk)_
- `account_id`: text _(required, fk)_
- `amount`: real _(required)_
- `currency`: text _(required)_
- `tran_id`: text _(unique, fk)_
- `val_id`: text _(fk)_
- `gateway_status`: text
- `status`: text _(required)_
- _relations_: registration_id -> registrations.id

## Schema Source Files

Search for ORM schema declarations:
- Drizzle: `pgTable` / `mysqlTable` / `sqliteTable`
- Prisma: `prisma/schema.prisma`
- TypeORM: `@Entity()` decorator
- SQLAlchemy: class inheriting `Base`

---
_Back to [overview.md](./overview.md)_