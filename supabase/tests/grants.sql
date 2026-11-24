-- Mirrors Supabase's defaults: new tables, sequences, and functions in "public" are
-- granted to these roles automatically; Row Level Security then decides the rows.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
