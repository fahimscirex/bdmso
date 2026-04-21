# Schema

### guardian_accounts
- id: text (pk)
- email: text (required)
- password_hash: text (required)
- password_salt: text (required)
- full_name: text (required)
- phone: text

### registrations
- id: text (pk)
- registration_type: text (required)
- student_full_name: text (required)
- student_date_of_birth: text (required)
- student_class_name: text (required)
- student_school: text (required)
- student_city: text (required)
- guardian_account_id: text (required, fk)
- guardian_full_name: text (required)
- guardian_relationship: text (required)
- guardian_phone: text (required)
- guardian_email: text (required)
- guardian_address: text (required)
- terms_accepted: integer (required)
- status: text (required)
- source_page: text

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
