-- Force all existing sessions to expire so users re-authenticate and
-- receive the new HttpOnly session cookie on their next login.
-- Safe: DELETE on sessions has no FK children. Users are redirected to
-- /login automatically by the client when their request returns 401.
DELETE FROM sessions;
