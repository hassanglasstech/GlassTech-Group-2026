-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSED MIGRATION — NOT auto-applied (lives in supabase/proposed/, not
-- supabase/migrations/). Deploy on STAGING first, test, then move to
-- supabase/migrations/ and wire the client (see "CLIENT WIRING" note below).
--
-- Purpose (Leakage #6): make Sales-Order approval ATOMIC.
-- Today the client (a) saves the quotation, then (b) decrements stock in a
-- separate write. A crash/network failure between the two leaves stock and the
-- order out of sync ("split-brain"). A Postgres function runs in a single
-- implicit transaction: if anything RAISEs, the WHOLE thing rolls back — so
-- either the order is approved AND stock is decremented, or neither happens.
--
-- It also enforces, inside the same lock, two guards that the JS path does
-- racily: (1) no double-approval, (2) no overselling (negative stock).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function approve_sales_order(
  p_quote      jsonb,   -- full quotation row (id, company, status, order_no, data, items, ...)
  p_decrements jsonb    -- array: [{ "id": "<store_item_id>", "qty": <number> }, ...]
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_id        text := p_quote->>'id';
  v_company   text := p_quote->>'company';
  v_dec       jsonb;
  v_sid       text;
  v_qty       numeric;
  v_avail     numeric;
begin
  if v_id is null or v_company is null then
    raise exception 'approve_sales_order: quote id and company are required';
  end if;

  -- Guard #1 — no double approval. Lock the existing row if present.
  perform 1 from quotations where id = v_id for update;
  if exists (select 1 from quotations where id = v_id and status = 'Approved') then
    raise exception 'approve_sales_order: quotation % is already approved', v_id;
  end if;

  -- Guard #2 — sufficient stock for every decrement (lock each store row).
  for v_dec in select * from jsonb_array_elements(coalesce(p_decrements, '[]'::jsonb))
  loop
    v_sid := v_dec->>'id';
    v_qty := coalesce((v_dec->>'qty')::numeric, 0);
    if v_sid is null or v_qty <= 0 then
      continue;
    end if;

    select coalesce(unrestricted_qty, quantity, 0)
      into v_avail
      from store_items
     where id = v_sid
     for update;

    if v_avail is null then
      raise exception 'approve_sales_order: store item % not found', v_sid;
    end if;
    if v_qty > v_avail then
      raise exception 'approve_sales_order: insufficient stock for % (need %, have %)',
        v_sid, v_qty, v_avail;
    end if;
  end loop;

  -- Apply the decrements (same loop values, now safe).
  for v_dec in select * from jsonb_array_elements(coalesce(p_decrements, '[]'::jsonb))
  loop
    v_sid := v_dec->>'id';
    v_qty := coalesce((v_dec->>'qty')::numeric, 0);
    if v_sid is null or v_qty <= 0 then
      continue;
    end if;
    update store_items
       set quantity         = coalesce(quantity, 0) - v_qty,
           unrestricted_qty = coalesce(unrestricted_qty, quantity, 0) - v_qty,
           updated_at       = now()
     where id = v_sid;
  end loop;

  -- Upsert the approved quotation (column set mirrors AsyncSalesService.saveQuotations).
  insert into quotations (
    id, company, data, date, due_date, client_id, project_name, subject, items,
    status, is_already_dispatched, discount_percent, discount_amount,
    manual_serial, order_no, received_amount, service_charges, manual_ref,
    order_type, updated_at
  ) values (
    v_id,
    v_company,
    p_quote,
    nullif(p_quote->>'date',''),
    nullif(p_quote->>'dueDate',''),
    coalesce(p_quote->>'clientId',''),
    coalesce(p_quote->>'projectName',''),
    coalesce(p_quote->>'subject',''),
    coalesce(p_quote->'items','[]'::jsonb),
    coalesce(p_quote->>'status','Approved'),
    coalesce((p_quote->>'isAlreadyDispatched')::boolean, false),
    coalesce((p_quote->>'discountPercent')::numeric, 0),
    coalesce((p_quote->>'discountAmount')::numeric, 0),
    nullif(p_quote->>'manualSerial',''),
    nullif(p_quote->>'orderNo',''),
    coalesce((p_quote->>'receivedAmount')::numeric, 0),
    coalesce(p_quote->'serviceCharges','[]'::jsonb),
    nullif(p_quote->>'manualRef',''),
    coalesce(p_quote->>'orderType','Standard'),
    now()
  )
  on conflict (id) do update set
    data                  = excluded.data,
    status                = excluded.status,
    order_no              = excluded.order_no,
    discount_percent      = excluded.discount_percent,
    discount_amount       = excluded.discount_amount,
    items                 = excluded.items,
    received_amount       = excluded.received_amount,
    service_charges       = excluded.service_charges,
    updated_at            = now();

  return jsonb_build_object('ok', true, 'id', v_id, 'status', coalesce(p_quote->>'status','Approved'));
end;
$$;

-- ── CLIENT WIRING (after staging validation) ───────────────────────────────
-- In modules/sales/companies/nippon/useNipponQuotations.ts handleSave(approve):
-- build the decrements array from finalQuo.items
--   const decrements = finalQuo.items
--     .filter(i => !i.isSection && i.locationCode)
--     .map(i => ({ id: i.locationCode, qty: Number(i.qty) || 0 }));
-- then:
--   const { error } = await supabase.rpc('approve_sales_order',
--     { p_quote: finalQuo, p_decrements: decrements });
--   if (!error) { /* atomic path done — SKIP the JS saveQuotations + saveStore */ }
--   else { /* RPC errored (incl. not-deployed) -> run the CURRENT JS fallback */ }
-- Because a Postgres function is one transaction, an error means NOTHING was
-- committed, so the JS fallback is always safe to run.
-- ═══════════════════════════════════════════════════════════════════════════
