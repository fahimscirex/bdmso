# Routes

## CRUD Resources

- **`/admin/posts`** GET | POST | GET/:id | PATCH/:id | DELETE/:id → Post
- **`/admin/programs`** GET | POST | GET/:id | PATCH/:id | DELETE/:id → Program
- **`/admin/coupons`** GET | POST | GET/:id | PATCH/:id | DELETE/:id → Coupon

## Other Routes

- `POST` `/login` params() [auth, db, cache, email, upload]
- `POST` `/logout` params() [auth, db, cache, email, upload]
- `GET` `/me` params() [auth, db, cache, email, upload]
- `POST` `/submit-registration` params() [auth, db, cache, email, upload]
- `POST` `/add-enrollment` params() [auth, db, cache, email, upload]
- `GET` `/validate-coupon` params() [auth, db, cache, email, upload]
- `POST` `/submit-sponsorship` params() [auth, db, cache, email, upload]
- `POST` `/create-payment` params() [auth, db, cache, email, upload]
- `ALL` `/payment-callback` params() [auth, db, cache, email, upload]
- `GET` `/verify-email` params() [auth, db, cache, email, upload]
- `POST` `/resend-verification` params() [auth, db, cache, email, upload]
- `GET` `/admin/health` params() [auth, db, upload]
- `GET` `/admin/registrations` params() [auth, db, upload]
- `GET` `/admin/registrations/:id` params(id) [auth, db, upload]
- `PATCH` `/admin/registrations/:id/status` params(id) [auth, db, upload]
- `GET` `/admin/payments` params() [auth, db, upload]
- `GET` `/admin/sponsorships` params() [auth, db, upload]
- `PATCH` `/admin/sponsorships/:id/status` params(id) [auth, db, upload]
- `GET` `/admin/users` params() [auth, db, upload]
- `PATCH` `/admin/users/:id/role` params(id) [auth, db, upload]
- `POST` `/admin/uploads` params() [auth, db, upload]
- `GET` `/admin/audit` params() [auth, db, upload]
- `GET` `/me/profile` params() [auth, payment]
- `PATCH` `/me/profile` params() [auth, payment]
- `PATCH` `/me/registrations/:id` params(id) [auth, payment]
- `POST` `/me/registrations/:id/cancel` params(id) [auth, payment]
- `POST` `/me/change-password` params() [auth, payment]
- `POST` `/me/revoke-sessions` params() [auth, payment]
