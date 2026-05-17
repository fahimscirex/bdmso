# Schema

### guardian_accounts
- id: text (pk)
- email: text (required)
- password_hash: text (required)
- password_salt: text (required)
- password_iterations: integer (required)
- full_name: text (required)
- phone: text
- email_verified: integer (required)
- member_id: text (fk)

### email_verification_tokens
- token: text (pk)
- account_id: text (required, fk)
- expires_at: text (required)

### login_attempts
- id: integer (pk)
- email: text (required)
- success: integer (required)
- attempted_at: text (required)

### registrations
- id: text (pk)
- registration_type: text (required)
- student_full_name: text (required)
- student_date_of_birth: text (required)
- student_class_name: text (required)
- student_gender: text (required)
- student_medium: text
- student_school: text (required)
- student_district: text (required)
- guardian_account_id: text (required, fk)
- guardian_full_name: text (required)
- guardian_relationship: text (required)
- guardian_phone: text (required)
- guardian_email: text (required)
- guardian_address: text (required)
- preferred_venue: text
- terms_accepted: integer (required)
- status: text (required)
- source_page: text

### member_id_seq
- id: integer (pk)
- reserved_at: text (required)

### sponsorship_enquiries
- id: text (pk)
- organization: text (required)
- contact_person: text (required)
- email: text (required)
- phone: text
- interest: text (required)
- message: text (required)
- status: text (required)
- source_page: text

### sessions
- id: text (pk)
- account_id: text (required, fk)
- expires_at: text (required)

### payments
- id: text (pk)
- registration_id: text (required, fk)
- amount: real (required)
- currency: text (required)
- tran_id: text (unique, fk)

### bkash_token_cache
- id: integer (pk)
- expires_at: text (required)

### coupons
- code: text (pk)
- discount_type: text (required)
- max_uses: integer
- applies_to: text
