#!/usr/bin/env node
/**
 * Fetch the last 30 days of visitors, for the figure the landing page states.
 *
 * Runs during the BUILD, on the host, and writes a single number to
 * `.visitors` in the project root. vite.config.ts and scripts/prerender.mjs
 * read that file and bake the number into the bundle, so the page itself never
 * calls an analytics API and the site keeps working with no server.
 *
 * Source: Cloudflare Web Analytics, through the GraphQL API. Cloudflare already
 * serves this site, its analytics are cookie-free, and a read-only API token is
 * the whole configuration. GA4 would need a service-account key and a signed
 * JWT for the same number.
 *
 * REQUIRED ENVIRONMENT, both set on the Pages project:
 *   CF_ANALYTICS_TOKEN  API token with Account Analytics:Read
 *   CF_ACCOUNT_ID       the Cloudflare account the site belongs to
 *   CF_SITE_TAG         the Web Analytics site tag (Cloudflare dashboard →
 *                       Web Analytics → the site → its siteTag)
 *
 * TESTING IT: `npm run visitors` with the three variables set prints what the
 * API returned and writes `.visitors`, so the query can be checked in one
 * command rather than by watching a deploy. If Cloudflare renames a field in
 * the RUM dataset the error it sends back is printed verbatim, which is the
 * fastest way to find out.
 *
 * MISSING ENVIRONMENT IS NOT AN ERROR. A fork, a local build and a CI run
 * without the token all succeed and simply produce no figure, which the page
 * renders as no sentence at all. The same is true of an API that is down: a
 * build must not fail because an analytics endpoint had a bad night.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('.visitors');
const ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const DAYS = 30;

const QUERY = `
  query Visitors($accountTag: String!, $siteTag: String!, $since: String!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        rumPageloadEventsAdaptiveGroups(
          limit: 1
          filter: { siteTag: $siteTag, datetime_geq: $since }
        ) {
          sum { visits }
        }
      }
    }
  }
`;

/** The number of visits in the response, or null if the shape is not what we expect. */
export function readVisits(payload) {
  const groups = payload?.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups;
  const visits = groups?.[0]?.sum?.visits;
  return Number.isInteger(visits) && visits >= 0 ? visits : null;
}

async function main() {
  const token = process.env.CF_ANALYTICS_TOKEN;
  const accountTag = process.env.CF_ACCOUNT_ID;
  const siteTag = process.env.CF_SITE_TAG;

  if (!token || !accountTag || !siteTag) {
    await writeFile(OUT, '0\n');
    console.log('  visitors: not configured, the site will not state a figure');
    return;
  }

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  let visits = null;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { accountTag, siteTag, since } }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (payload.errors?.length) throw new Error(payload.errors[0].message);
    visits = readVisits(payload);
  } catch (err) {
    // Deliberately not fatal: an analytics outage must not stop a deploy.
    console.log(`  visitors: could not be read (${err.message}), carrying on without a figure`);
    await writeFile(OUT, '0\n');
    return;
  }

  if (visits === null) {
    console.log('  visitors: the API answered with no usable number');
    await writeFile(OUT, '0\n');
    return;
  }

  await writeFile(OUT, `${visits}\n`);
  console.log(`  visitors: ${visits.toLocaleString('en-US')} in the last ${DAYS} days`);
}

// Only run when invoked directly, so the parser above stays unit-testable.
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
