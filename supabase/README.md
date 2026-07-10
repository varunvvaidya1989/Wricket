# Supabase Workspace

This directory is reserved for Supabase CLI-managed configuration and
migrations.

Do not hand-create migration filenames. When schema work starts, initialize and
manage this directory with the Supabase CLI:

```bash
supabase --help
supabase init
supabase migration new <descriptive_name>
```

Security rules:

- Enable RLS on every exposed table.
- Keep service-role and secret keys out of mobile code and committed files.
- Use `EXPO_PUBLIC_SUPABASE_URL` and
  `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the client only.
