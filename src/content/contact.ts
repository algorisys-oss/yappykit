/**
 * The operator's identity and contact address, in one place.
 *
 * These facts appear on the Contact page, in the Privacy Policy, in the Terms
 * and on the About page. Four surfaces naming three different operators is
 * exactly the kind of inconsistency that makes a site look untrustworthy to a
 * reader deciding whether to hand it a passport scan, so the address at least
 * cannot drift: it is defined here and imported.
 *
 * The prose around it is still per-page, because a privacy policy and a contact
 * page should not say the same sentence, but the party and the address are one
 * source of truth.
 */

/** Where email actually reaches someone. */
export const SUPPORT_EMAIL = 'osappsupport@gmail.com';

/** The legal operator. Must match ./privacy, ./terms and the About page. */
export const OPERATOR = 'Algorisys Technologies';

/** Where that operator is based, which is what governing law turns on. */
export const OPERATOR_LOCATION = 'Mumbai, Maharashtra, India';
