-- Jaman Store multi-brand and payment-plan schema foundation.
-- Additive only. Apply to a test database first; do not apply directly to production
-- until the recovery export and the complete payment/API changes have been reviewed.

begin;

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  logo_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.brands (name,slug,description,active,sort_order)
values
 ('VITAFOAM','vitafoam','VITAFOAM mattresses, pillows and related products.',true,10),
 ('Nexus','nexus','Nexus electronics and home appliances.',true,20)
on conflict (slug) do nothing;

alter table public.products
  add column if not exists brand_id uuid references public.brands(id);

update public.products
set brand_id=(select id from public.brands where slug='vitafoam')
where brand_id is null;

create index if not exists products_brand_id_idx on public.products(brand_id);

-- Supplier costs are intentionally kept out of the public products table.
create table if not exists public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  landed_cost_naira numeric(14,2) not null check (landed_cost_naira >= 0),
  markup_percent numeric(6,2) not null default 25 check (markup_percent between 0 and 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.order_payment_plans (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  deposit_percent numeric(5,2) not null default 30 check (deposit_percent=30),
  deposit_amount_naira numeric(14,2) not null check (deposit_amount_naira>=0),
  financed_balance_naira numeric(14,2) not null check (financed_balance_naira>=0),
  term_months integer not null check (term_months in (2,3,4)),
  monthly_amount_naira numeric(14,2) not null check (monthly_amount_naira>=0),
  first_due_at timestamptz not null,
  status text not null default 'awaiting_deposit'
    check (status in ('awaiting_deposit','active','completed','overdue','cancelled')),
  terms_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_installments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.order_payment_plans(id) on delete cascade,
  installment_number integer not null check (installment_number between 1 and 4),
  due_at timestamptz not null,
  amount_due_naira numeric(14,2) not null check (amount_due_naira>=0),
  amount_paid_naira numeric(14,2) not null default 0 check (amount_paid_naira>=0),
  status text not null default 'pending'
    check (status in ('pending','partially_paid','paid','overdue','waived')),
  paid_at timestamptz,
  payment_id uuid references public.payments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id,installment_number),
  check(amount_paid_naira<=amount_due_naira)
);

alter table public.orders add column if not exists payment_method text not null default 'paystack';
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check(payment_method in ('paystack','pay_on_delivery','installment'));

create index if not exists order_payment_plans_status_due_idx
  on public.order_payment_plans(status,first_due_at);
create index if not exists order_installments_due_status_idx
  on public.order_installments(status,due_at);

alter table public.brands enable row level security;
alter table public.product_costs enable row level security;
alter table public.order_payment_plans enable row level security;
alter table public.order_installments enable row level security;

drop policy if exists "Public can view active brands" on public.brands;
create policy "Public can view active brands" on public.brands
  for select to anon,authenticated using(active=true);

-- Deliberately no client policies on product_costs or payment-plan tables.
-- Access must be mediated by authenticated server-side admin APIs using service role.

commit;
