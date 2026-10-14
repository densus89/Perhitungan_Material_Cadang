alter table public.profiles
  drop constraint profiles_email_pln_domain,
  add constraint profiles_email_pln_domain check (
    email = lower(btrim(email))
    and (
      email ~ '^[^[:space:]@]+@pln\.co\.id$'
      or email = 'sitompul89@gmail.com'
    )
  );
