-- Treasury corrections are ordinary append-only entries. Remove the former
-- reversal-specific relationship constraint while preserving migration 020.
drop index if exists treasury_capability.treasury_entries_one_direct_reversal;
