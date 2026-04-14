# Supabase auth email templates

These HTML files are the source of truth for TenderWatch's auth emails. The
login/signup UI (`src/app/(auth)/login/login-form.tsx` and
`src/app/(auth)/signup/signup-form.tsx`) asks users to paste a 6-digit code
from their email, so the templates **must** include `{{ .Token }}`.

Supabase's default templates only include `{{ .ConfirmationURL }}`, which is
why auth emails previously arrived without a code.

## Templates

- `magic_link.html` — sent by `signInWithOtp` to existing users (login).
- `confirmation.html` — sent by `signInWithOtp` to new users (signup).

Both templates show the OTP token prominently and also include the magic
link as a fallback for users on the same device.

## Applying the templates

### Option A — Supabase CLI (recommended)

From the repo root:

```bash
supabase link --project-ref <your-project-ref>
supabase config push
```

`supabase/config.toml` references these HTML files, so a single push
updates both the magic-link and confirmation templates on the hosted project.

### Option B — Supabase dashboard

If you don't use the CLI, copy the HTML from each file into the matching
template in **Authentication → Email Templates**:

- `magic_link.html` → *Magic Link* template
- `confirmation.html` → *Confirm signup* template

Make sure `{{ .Token }}` survives the paste — that's the variable that
renders the 6-digit code.
