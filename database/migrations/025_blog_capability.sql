-- Blog administration is an application capability, not a commercial role.
alter table identity_capability.account_capabilities drop constraint if exists account_capabilities_known;
alter table identity_capability.account_capabilities add constraint account_capabilities_known
  check (capability in ('operator','catalogue_manager','blog_manager'));
