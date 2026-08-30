-- Each treasury entry may have at most one direct compensating reversal.
-- Reversal entries remain ordinary immutable entries and can themselves be reversed.
create unique index treasury_entries_one_direct_reversal
  on treasury_capability.entries(source_id)
  where source_kind = 'treasury_reversal' and source_id is not null;
