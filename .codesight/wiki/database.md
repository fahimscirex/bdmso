# Database

> **Navigation aid.** Schema shapes and field types extracted via AST. Read the actual schema source files before writing migrations or query logic.

**unknown** — 3 models

### guardian_accounts

pk: `id` (text)

- `id`: text _(pk)_
- `email`: text _(required)_
- `password_hash`: text _(required)_
- `password_salt`: text _(required)_
- `full_name`: text _(required)_
- `phone`: text

### registrations

pk: `id` (text) · fk: guardian_account_id

- `id`: text _(pk)_
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

## Schema Source Files

Search for ORM schema declarations:
- Drizzle: `pgTable` / `mysqlTable` / `sqliteTable`
- Prisma: `prisma/schema.prisma`
- TypeORM: `@Entity()` decorator
- SQLAlchemy: class inheriting `Base`

---
_Back to [overview.md](./overview.md)_