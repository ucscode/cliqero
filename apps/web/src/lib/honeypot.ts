/**
 * The hidden trap field is deliberately opaque so browser profile/password
 * autofill is unlikely to treat it as a real user field. The server still
 * accepts the legacy `website` name for direct/older clients.
 */
export const HONEYPOT_FIELD_NAME = "referenceId";
export const HONEYPOT_HEADER_NAME = "x-cliqero-honeypot";
