# Manual Standard.site publishing

This is the credential-safe runbook for the portfolio's **manual-only** Standard.site process. It is an operator procedure, not an application integration.

## Scope and source of truth

- The Markdown files and their frontmatter in `src/content/blog/`, together with the **deployed rendered site**, are authoritative. Use the explicit frontmatter `slug`, the current rendered title and description, and the rendered JSON-LD `datePublished` when preparing a record.
- Standard.site records are a **metadata-only mirror** for discovery and association. They do not replace Markdown/frontmatter, the deployed HTML, the RSS feed, or the site's publication workflow.
- No importer, synchronizer, Standard.site client, or PDS call runs in Astro builds, `pnpm verify`, GitHub Actions, or any other CI job. Every record operation in this document is an intentional, interactive manual action.
- Never send article content, `textContent`, Markdown, HTML, blobs, images, themes, subscriptions, recommends, or Bluesky/social references. The record bodies below contain only the approved publication metadata or document metadata.
- A publication page link is a **discovery hint only**. The publication `.well-known` response is the publication verification check. A document's `rel="site.standard.document"` link is the document verification check. Neither link causes a build-time or CI-time PDS operation.

## Configured identity and collections

These values are fixed for this publication:

| Item | Value |
| --- | --- |
| Handle | `marcelinebelardo.com` |
| DID | `did:plc:fakq3c4v2fvivhoc3cgom3nc` |
| Canonical origin / publication URL | `https://www.marcelinebelardo.com` |
| Publication name | `Art Computer Insanity Posting` |
| Publication description | `Marceline Belardo's thoughts on tech, politics, and art` |
| Publication collection | `site.standard.publication` |
| Document collection | `site.standard.document` |

The configured DID is an expected identity to compare with independently resolved identity data. Do not silently substitute another DID or handle.

## Prerequisites and credential rules

Use Bash, `curl`, and `jq`. The documented minimums are Bash 4 or newer, curl 7.76 or newer (for `--fail-with-body`), and jq 1.6 or newer. The commands use `set -Eeuo pipefail`, process substitution, `--data-binary @-`, HTTPS, and `jq -e`; check first:

```bash
bash --version
curl --version
jq --version
```

Use a **dedicated app password** created for this manual workflow, with the minimum permissions the account and PDS expose for creating/updating/deleting these records. Never use the account password. Never put a password in a command argument, shell history, tracked file, Markdown example, URL, or chat transcript. Do not paste a real token, app password, refresh token, or response containing one into the repository. Run from a private terminal, and remove temporary files when finished.

This personal manual workflow accepts app-password login through `com.atproto.server.createSession`. Official atproto guidance prefers OAuth for new applications; OAuth is deliberately deferred here because this is an occasional, personal, interactive procedure rather than an application. Do not turn this runbook into an unattended login or a build integration.

## Resolve the handle and discover the current PDS

Resolve the handle through the atproto identity endpoint, then independently inspect the PLC DID document. Do not rely solely on an HTTP DID well-known file at the domain: it is not a substitute for the PLC document. The PLC document's current `#atproto_pds` service with an HTTPS endpoint is the PDS base URL for subsequent calls.

The following discovery block prints only non-secret identity and endpoint data. It rejects redirects and validates every response with explicit `jq -e` identity checks. `DISCOVERY_TMP` is temporary and is removed by the trap in the session block below if both blocks are run in the same shell.

```bash
set -Eeuo pipefail
IFS=$'\n\t'
set +x

HANDLE='marcelinebelardo.com'
EXPECTED_DID='did:plc:fakq3c4v2fvivhoc3cgom3nc'
EXPECTED_ORIGIN='https://www.marcelinebelardo.com'
DISCOVERY_TMP="$(mktemp -d "${TMPDIR:-/tmp}/standard-site.XXXXXX")"

cleanup() {
  local exit_code=$?
  set +x
  unset ATPROTO_APP_PASSWORD ATPROTO_HANDLE ACCESS_JWT REFRESH_JWT SESSION_DID SESSION_HANDLE
  unset HANDLE EXPECTED_DID EXPECTED_ORIGIN PDS_URL PUBLICATION_URI PUBLICATION_RKEY
  unset SESSION_JSON SESSION_RESPONSE AUTH_HEADER api_json resolved_did resolved_handle
  unset CREATE_PUBLICATION_REQUEST CREATE_PUBLICATION_RESPONSE CREATE_PUBLICATION_ENVELOPE
  unset DOCUMENT_REQUEST DOCUMENT_ENVELOPE DOCUMENT_RESPONSE PUT_DOCUMENT_REQUEST
  unset DELETE_DOCUMENT_REQUEST
  unset DOCUMENT_URI DOCUMENT_DID DOCUMENT_RKEY GET_DOCUMENT_RESPONSE LIVE_CID CONFIRMATION
  if [[ -n "${DISCOVERY_TMP:-}" && -d "${DISCOVERY_TMP}" ]]; then
    rm -rf -- "${DISCOVERY_TMP}"
  fi
  unset DISCOVERY_TMP
  return "${exit_code}"
}
trap cleanup EXIT HUP INT TERM
set +x

resolve_json="${DISCOVERY_TMP}/resolve.json"
did_json="${DISCOVERY_TMP}/did.json"

curl --fail-with-body --silent --show-error --location-trusted --max-redirs 0 --proto '=https' --proto-redir '=https' \
  --request GET --get --data-urlencode "handle=${HANDLE}" \
  'https://bsky.social/xrpc/com.atproto.identity.resolveHandle' \
  --output "${resolve_json}"

jq -e --arg expected_handle "${HANDLE}" --arg expected_did "${EXPECTED_DID}" \
  '(.did | type == "string" and . == $expected_did) and
   ($expected_handle | type == "string" and length > 0)' \
  "${resolve_json}" >/dev/null
resolved_did="$(jq -er '.did' "${resolve_json}")"
resolved_handle="${HANDLE}"
printf 'Resolved handle: %s\nResolved DID: %s\n' "${resolved_handle}" "${resolved_did}"

curl --fail-with-body --silent --show-error --location-trusted --max-redirs 0 --proto '=https' --proto-redir '=https' \
  --request GET "https://plc.directory/${resolved_did}" \
  --output "${did_json}"

jq -e --arg did "${resolved_did}" \
  '(.id == $did) and (.service | type == "array") and
   ([.service[]? | select(.id == "#atproto_pds") |
      select(.type == "AtprotoPersonalDataServer") |
      .serviceEndpoint] | map(select(type == "string" and startswith("https://"))) | length == 1)' \
  "${did_json}" >/dev/null
PDS_URL="$(jq -er '[.service[] | select(.id == "#atproto_pds") |
  select(.type == "AtprotoPersonalDataServer") | .serviceEndpoint |
  select(type == "string" and startswith("https://"))][0]' "${did_json}")"

printf 'PLC DID document: %s\nCurrent HTTPS #atproto_pds: %s\n' "${resolved_did}" "${PDS_URL}"

if [[ "${resolved_did}" != "${EXPECTED_DID}" ]]; then
  printf 'ERROR: resolved DID does not match the configured DID. Stop.\n' >&2
  exit 1
fi
```

`--max-redirs 0` is intentional: discovery and API calls must not silently follow a redirect to a different host. The `resolveHandle` host is an operator choice for resolution; the PLC document, not the handle service, determines the current PDS. If the PLC document has zero or multiple current HTTPS `#atproto_pds` services, stop and investigate rather than choosing one.

The domain's `/.well-known/did.json` may be inspected as an additional diagnostic, but it is not an identity or PDS authority for this procedure. Compare it only after the PLC resolution and record any discrepancy in release evidence.

## Start a manual session safely

The following is the required credential-handling pattern. Keep tracing disabled. It silently reads the app password and **immediately** exports `ATPROTO_APP_PASSWORD`; do not insert an `echo`, logging statement, subprocess, or other command between `read -s` and the export. The create-session JSON is built by `jq` reading `env.ATPROTO_APP_PASSWORD`, never by `jq --arg` and never by placing the secret in an argument.

```bash
set +x
read -r -s -p 'Dedicated atproto app password (input hidden): ' ATPROTO_APP_PASSWORD
export ATPROTO_APP_PASSWORD
printf '\n' >&2
export ATPROTO_HANDLE="${HANDLE}"

SESSION_JSON="${DISCOVERY_TMP}/session.json"
SESSION_RESPONSE="${DISCOVERY_TMP}/session-response.json"
jq -n '{identifier: env.ATPROTO_HANDLE, password: env.ATPROTO_APP_PASSWORD}' \
  | tee "${SESSION_JSON}" \
  | curl --fail-with-body --silent --show-error --location-trusted --max-redirs 0 --proto '=https' --proto-redir '=https' \
      --request POST --header 'content-type: application/json' \
      --data-binary @- "${PDS_URL%/}/xrpc/com.atproto.server.createSession" \
      --output "${SESSION_RESPONSE}"

jq -e '(.did | type == "string" and startswith("did:")) and
       (.handle | type == "string" and length > 0) and
       (.accessJwt | type == "string" and length > 0) and
       (.refreshJwt | type == "string" and length > 0)' \
  "${SESSION_RESPONSE}" >/dev/null

SESSION_DID="$(jq -er '.did' "${SESSION_RESPONSE}")"
SESSION_HANDLE="$(jq -er '.handle' "${SESSION_RESPONSE}")"
ACCESS_JWT="$(jq -er '.accessJwt' "${SESSION_RESPONSE}")"
REFRESH_JWT="$(jq -er '.refreshJwt' "${SESSION_RESPONSE}")"

if [[ "${SESSION_DID}" != "${EXPECTED_DID}" || "${SESSION_HANDLE}" != "${HANDLE}" ]]; then
  printf 'ERROR: authenticated identity does not match the configured identity. Stop.\n' >&2
  exit 1
fi
```

Do not print `SESSION_RESPONSE`, `ACCESS_JWT`, `REFRESH_JWT`, or the app password. The response file may contain both tokens and is temporary secret material. The `jq -e` check is deliberately explicit; a syntactically valid but incomplete response is a failure.

Every subsequent authenticated curl must keep the JWT out of argv. Use a stdin/process-substitution header pattern such as this (the shell expands the substitution to a file descriptor; the token is not written as a literal command argument):

```bash
api_json="${DISCOVERY_TMP}/api-response.json"
printf 'Authorization: Bearer %s\n' "${ACCESS_JWT}" \
  | curl --fail-with-body --silent --show-error --location-trusted --max-redirs 0 --proto '=https' --proto-redir '=https' \
      --request GET --header @- \
      "${PDS_URL%/}/xrpc/com.atproto.repo.getRecord?repo=${SESSION_DID}&collection=site.standard.publication&rkey=${PUBLICATION_RKEY}" \
      --output "${api_json}"
```

For a reusable process-substitution form, use a temporary header file whose permissions are restricted, and remove it promptly:

```bash
umask 077
AUTH_HEADER="${DISCOVERY_TMP}/authorization.header"
printf 'Authorization: Bearer %s\n' "${ACCESS_JWT}" >"${AUTH_HEADER}"
# curl reads the header from a file; ACCESS_JWT is not in this command's argv.
curl --fail-with-body --silent --show-error --location-trusted --max-redirs 0 --proto '=https' --proto-redir '=https' \
  --request GET --header @"${AUTH_HEADER}" \
  "${PDS_URL%/}/xrpc/com.atproto.repo.getRecord?repo=${SESSION_DID}&collection=site.standard.publication&rkey=${PUBLICATION_RKEY}" \
  --output "${api_json}"
# Equivalent stdin form: curl ... --header @- ... < <(printf 'Authorization: Bearer %s\n' "${ACCESS_JWT}")
```

Use the same header-file or process-substitution pattern for POST calls. Never use `--header "Authorization: Bearer ${ACCESS_JWT}"` in a shared shell transcript, wrapper script, or copied command. It can expose the JWT in process listings or command history.

The cleanup trap is installed before discovery and remains active for the complete manual session. A shell cannot erase a secret already copied into terminal scrollback, process-monitor output, swap, or an accidental log. If exposure is suspected, stop, revoke the app password immediately, and create a replacement; do not attempt to “clean” the repository by rewriting history alone.

## Create the publication record

Before creating anything, complete a review against the authoritative deployed site and configured identity. The **only approved publication record** is this metadata-only object:

```json
{
  "$type": "site.standard.publication",
  "url": "https://www.marcelinebelardo.com",
  "name": "Art Computer Insanity Posting",
  "description": "Marceline Belardo's thoughts on tech, politics, and art",
  "preferences": {
    "showInDiscover": true
  }
}
```

Create it manually with `com.atproto.repo.createRecord`. Do **not** supply an `rkey`; the PDS creates the record's TID rkey. The example below uses a temporary request file and the safe authorization-header pattern. Replace only the placeholder PDS/session variables from the preceding blocks; do not add content fields.

```bash
CREATE_PUBLICATION_REQUEST="${DISCOVERY_TMP}/create-publication.json"
CREATE_PUBLICATION_RESPONSE="${DISCOVERY_TMP}/create-publication-response.json"
CREATE_PUBLICATION_ENVELOPE="${DISCOVERY_TMP}/create-publication-envelope.json"
cat >"${CREATE_PUBLICATION_REQUEST}" <<'JSON'
{
  "$type": "site.standard.publication",
  "url": "https://www.marcelinebelardo.com",
  "name": "Art Computer Insanity Posting",
  "description": "Marceline Belardo's thoughts on tech, politics, and art",
  "preferences": {
    "showInDiscover": true
  }
}
JSON
jq --arg repo "${SESSION_DID}" \
  '{repo: $repo, collection: "site.standard.publication", record: .}' \
  "${CREATE_PUBLICATION_REQUEST}" >"${CREATE_PUBLICATION_ENVELOPE}"

printf 'Authorization: Bearer %s\n' "${ACCESS_JWT}" \
  | curl --fail-with-body --silent --show-error --location-trusted --max-redirs 0 --proto '=https' --proto-redir '=https' \
      --request POST \
      --header @- --header 'content-type: application/json' \
      --data-binary @"${CREATE_PUBLICATION_ENVELOPE}" \
      "${PDS_URL%/}/xrpc/com.atproto.repo.createRecord" \
      --output "${CREATE_PUBLICATION_RESPONSE}"

jq -e --arg did "${SESSION_DID}" \
  '(.uri | type == "string" and startswith("at://")) and
   (.uri | test("^at://" + $did + "/site\\.standard\\.publication/[234567abcdefghijklmnopqrstuvwxyz]{13}$")) and
   (.cid | type == "string" and length > 0)' \
  "${CREATE_PUBLICATION_RESPONSE}" >/dev/null
PUBLICATION_URI="$(jq -er '.uri' "${CREATE_PUBLICATION_RESPONSE}")"
PUBLICATION_RKEY="${PUBLICATION_URI##*/}"
printf 'Created publication URI (safe to record): %s\n' "${PUBLICATION_URI}"
```

The returned `uri` is an opaque AT-URI identifier. Validate its DID and collection, then record the complete URI. Do not infer a timestamp from the TID, do not replace it with a guessed rkey, and do not publish the returned CID. The public registry should contain the publication AT-URI only (no CID):

```text
PUBLICATION_AT_URI=at://did:plc:fakq3c4v2fvivhoc3cgom3nc/site.standard.publication/<pds-created-rkey>
```

Update the registry using its documented maintenance path (for example, the registry's issue/entry workflow) with that URI and the date/operator evidence. The registry is a public pointer, not a credential store and not a place for CIDs or tokens. If a publication already exists, do not create a duplicate; first retrieve and compare it.

## Create one document metadata record

For each published blog post, use the deployed HTML and its source Markdown/frontmatter as the authority. `<explicit-slug>` must be the non-empty explicit lowercase `slug` in that post's frontmatter; do not derive it from a filename or title. The path must have the trailing slash exactly as shown. `title` and `description` must be the current rendered/frontmatter values. `publishedAt` must be the ISO timestamp in the deployed page's JSON-LD `datePublished` (not an inferred TID time and not a local-time conversion).

The exact metadata-only template without tags is:

```json
{
  "$type": "site.standard.document",
  "site": "at://did:plc:fakq3c4v2fvivhoc3cgom3nc/site.standard.publication/<pds-created-rkey>",
  "title": "<current rendered post title>",
  "path": "/blog/<explicit-slug>/",
  "description": "<current frontmatter description>",
  "publishedAt": "<JSON-LD datePublished ISO timestamp>"
}
```

If and only if frontmatter has one or more non-empty tags, add this final property (preserving the source/frontmatter order):

```json
"tags": ["<non-empty-tag-1>", "<non-empty-tag-2>"]
```

When there are no tags, omit `tags` entirely. Never add `textContent`, `content`, `blob`, image, theme, subscription, recommend, or Bluesky fields. Do not send draft posts.

Create the document record with no supplied rkey so the PDS generates a TID:

```bash
DOCUMENT_REQUEST="${DISCOVERY_TMP}/create-document.json"
DOCUMENT_ENVELOPE="${DISCOVERY_TMP}/create-document-envelope.json"
DOCUMENT_RESPONSE="${DISCOVERY_TMP}/create-document-response.json"
cat >"${DOCUMENT_REQUEST}" <<'JSON'
{
  "$type": "site.standard.document",
  "site": "at://did:plc:fakq3c4v2fvivhoc3cgom3nc/site.standard.publication/<pds-created-rkey>",
  "title": "<current rendered post title>",
  "path": "/blog/<explicit-slug>/",
  "description": "<current frontmatter description>",
  "publishedAt": "<JSON-LD datePublished ISO timestamp>"
}
JSON
# Replace only the angle-bracket placeholders in the private temporary file.
# Set SLUG to the reviewed explicit frontmatter slug before running the guards.
SLUG='<explicit-slug>'

jq -e --arg did "${SESSION_DID}" --arg publication_uri "${PUBLICATION_URI}" \
  '((keys | sort) == ["$type", "description", "path", "publishedAt", "site", "title"] and (has("tags") | not)) or
   ((keys | sort) == ["$type", "description", "path", "publishedAt", "site", "tags", "title"] and (.tags | type == "array" and length > 0))' \
  "${DOCUMENT_REQUEST}" >/dev/null
jq -e --arg did "${SESSION_DID}" --arg publication_uri "${PUBLICATION_URI}" --arg slug "${SLUG}" \
  '(.site == $publication_uri) and
   (.site | test("^at://" + $did + "/site\\.standard\\.publication/[234567abcdefghijklmnopqrstuvwxyz]{13}$")) and
   (.path == ("/blog/" + $slug + "/")) and
   (.title | type == "string" and length > 0) and
   (.description | type == "string" and length > 0) and
   (.publishedAt | type == "string" and test("^20[0-9]{2}-[0-9]{2}-[0-9]{2}T"))' \
  "${DOCUMENT_REQUEST}" >/dev/null
jq --arg repo "${SESSION_DID}" \
  '{repo: $repo, collection: "site.standard.document", record: .}' \
  "${DOCUMENT_REQUEST}" >"${DOCUMENT_ENVELOPE}"

printf 'Authorization: Bearer %s\n' "${ACCESS_JWT}" \
  | curl --fail-with-body --silent --show-error --location-trusted --max-redirs 0 --proto '=https' --proto-redir '=https' \
      --request POST --header @- --header 'content-type: application/json' \
      --data-binary @"${DOCUMENT_ENVELOPE}" \
      "${PDS_URL%/}/xrpc/com.atproto.repo.createRecord" \
      --output "${DOCUMENT_RESPONSE}"

jq -e --arg did "${SESSION_DID}" \
  '(.uri | type == "string" and test("^at://" + $did + "/site\\.standard\\.document/[234567abcdefghijklmnopqrstuvwxyz]{13}$")) and
   (.cid | type == "string" and length > 0)' \
  "${DOCUMENT_RESPONSE}" >/dev/null
DOCUMENT_URI="$(jq -er '.uri' "${DOCUMENT_RESPONSE}")"
printf 'Created document URI (safe to record): %s\n' "${DOCUMENT_URI}"
```

Before making the public registry entry, inspect the returned opaque URI and verify that its record's `site`, `path`, `title`, `description`, and `publishedAt` match the deployed page. Add the document URI to the registry entry for the corresponding deployed URL, without adding its CID. The document URI is the only record identifier needed for later lookup; its rkey is the final URI segment.

## Update a document (whole-record replacement)

An update is not a patch. First call `com.atproto.repo.getRecord` using the document URI's DID, collection, and rkey. Capture the returned live `cid`. Build a complete replacement record containing every approved metadata field, including `site`, `title`, `path`, `description`, `publishedAt`, and `tags` only when non-empty. Never update a stale copy. Use `com.atproto.repo.putRecord` at the **same URI/rkey** and send `swapRecord=<live CID>` as the compare-and-swap guard.

A safe outline is:

```bash
DOCUMENT_DID='did:plc:fakq3c4v2fvivhoc3cgom3nc'
DOCUMENT_RKEY='<document-rkey-from-the-opaque-document-URI>'
GET_DOCUMENT_RESPONSE="${DISCOVERY_TMP}/get-document.json"

printf 'Authorization: Bearer %s\n' "${ACCESS_JWT}" \
  | curl --fail-with-body --silent --show-error --location-trusted --max-redirs 0 --proto '=https' --proto-redir '=https' \
      --request GET --header @- \
      "${PDS_URL%/}/xrpc/com.atproto.repo.getRecord?repo=${DOCUMENT_DID}&collection=site.standard.document&rkey=${DOCUMENT_RKEY}" \
      --output "${GET_DOCUMENT_RESPONSE}"

jq -e --arg did "${DOCUMENT_DID}" --arg rkey "${DOCUMENT_RKEY}" \
  '($rkey | test("^[234567abcdefghijklmnopqrstuvwxyz]{13}$")) and
   (.uri == ("at://" + $did + "/site.standard.document/" + $rkey)) and
   (.cid | type == "string" and length > 0) and
   (.value.$type == "site.standard.document")' \
  "${GET_DOCUMENT_RESPONSE}" >/dev/null
LIVE_CID="$(jq -er '.cid' "${GET_DOCUMENT_RESPONSE}")"
# DOCUMENT_REQUEST must now be a complete, reviewed replacement record object.
PUT_DOCUMENT_REQUEST="${DISCOVERY_TMP}/put-document-request.json"
jq --arg repo "${DOCUMENT_DID}" --arg rkey "${DOCUMENT_RKEY}" --arg swap "${LIVE_CID}" \
  '{repo: $repo, collection: "site.standard.document", rkey: $rkey, swapRecord: $swap, record: .}' \
  "${DOCUMENT_REQUEST}" >"${PUT_DOCUMENT_REQUEST}"

printf 'Authorization: Bearer %s\n' "${ACCESS_JWT}" \
  | curl --fail-with-body --silent --show-error --location-trusted --max-redirs 0 --proto '=https' --proto-redir '=https' \
      --request POST --header @- --header 'content-type: application/json' \
      --data-binary @"${PUT_DOCUMENT_REQUEST}" \
      "${PDS_URL%/}/xrpc/com.atproto.repo.putRecord" \
      --output "${DISCOVERY_TMP}/put-document.json"
```

For stricter URL handling, put query parameters in curl's `--get --data-urlencode` form rather than interpolating values. The important invariants are: same DID, collection, and rkey; complete record body; and the CID returned by the immediately preceding `getRecord`. `InvalidSwap` means the record changed after it was read (or the CID was wrong): stop, fetch again, review the new record, and retry only with a newly captured live CID. Do not remove `swapRecord` to force an overwrite.

After a successful update, validate the returned URI and CID locally, then check the deployed page and document verification link. Registry metadata remains URI-only; never replace the registry's URI with a CID.

## Delete / unpublish a document

Unpublishing a document record does not delete the Markdown post or deployed page. It removes only the metadata mirror. Before deletion, use `getRecord` to retrieve the record and its live CID, verify the URI/path against the intended deployed post, and obtain an explicit human confirmation. Then call `com.atproto.repo.deleteRecord` with the same DID, collection, rkey, and `swapRecord=<live CID>`.

```bash
printf 'About to delete document metadata record: %s\n' "${DOCUMENT_URI}" >&2
read -r -p 'Type DELETE-DOCUMENT to continue: ' CONFIRMATION
[[ "${CONFIRMATION}" == 'DELETE-DOCUMENT' ]] || { printf 'Cancelled.\n' >&2; exit 1; }

DELETE_DOCUMENT_REQUEST="${DISCOVERY_TMP}/delete-document-request.json"
jq -n --arg repo "${DOCUMENT_DID}" --arg rkey "${DOCUMENT_RKEY}" --arg swap "${LIVE_CID}" \
  '{repo: $repo, collection: "site.standard.document", rkey: $rkey, swapRecord: $swap}' \
  >"${DELETE_DOCUMENT_REQUEST}"

printf 'Authorization: Bearer %s\n' "${ACCESS_JWT}" \
  | curl --fail-with-body --silent --show-error --location-trusted --max-redirs 0 --proto '=https' --proto-redir '=https' \
      --request POST --header @- --header 'content-type: application/json' \
      --data-binary @"${DELETE_DOCUMENT_REQUEST}" \
      "${PDS_URL%/}/xrpc/com.atproto.repo.deleteRecord" \
      --output "${DISCOVERY_TMP}/delete-document.json"
```

Only after a successful delete response and an independent follow-up `getRecord` showing the intended record is missing may the operator remove that document URI from the public registry. Keep the deletion response and operator confirmation in release evidence, without recording secrets or CIDs in the public registry.

If `getRecord` says the record is missing, do not immediately recreate or remove a registry entry. Investigate: verify the DID, collection, rkey parsed from the opaque AT-URI, current PDS from the PLC document, and whether a previous operator already deleted or moved it. A missing document must be reconciled with the deployed HTML verification link and registry history. The document procedure must **never delete the publication**. Publication deletion, if ever authorized, is a separate, explicit procedure and is not covered here.

## Verification and release sequence

Run this sequence manually for each publication/document change:

1. **Source review:** confirm the Markdown/frontmatter is published, has the explicit slug, and matches the deployed rendered title, description, route, and JSON-LD `datePublished`. Confirm no draft is being mirrored.
2. **Build and repository verification:** run the repository's normal commands from the repository root. These do not contact a PDS:

   ```bash
   pnpm build
   pnpm verify
   git diff --check
   ```

   Confirm the generated route and metadata locally. Do not describe these commands as Standard.site synchronization; there is none.
3. **Deploy:** merge/push through the repository's normal deployment process and wait for the static deployment to complete. Record commit, workflow run, build/verify result, and deployed URL. The deployment itself does not create or update records.
4. **Live curl checks:** after deployment, perform and record status, final URL, headers, TLS result, and body-level checks. Do not assume these pass because a local build passed:

   ```bash
   curl --fail-with-body --silent --show-error --location-trusted --max-redirs 0 --proto '=https' --proto-redir '=https' \
     --request GET 'https://www.marcelinebelardo.com/' --output /tmp/standard-site-home.html
   curl --fail-with-body --silent --show-error --location-trusted --max-redirs 0 --proto '=https' --proto-redir '=https' \
     --request GET 'https://www.marcelinebelardo.com/.well-known/site.standard.publication' \
     --output /tmp/standard-site-publication.txt
   curl --fail-with-body --silent --show-error --location-trusted --max-redirs 0 --proto '=https' --proto-redir '=https' \
     --request GET 'https://www.marcelinebelardo.com/blog/<explicit-slug>/' \
     --output /tmp/standard-site-document.html
   ```

   The `.well-known` body must equal the publication AT-URI exactly. The document HTML must contain a `rel="site.standard.document"` link whose `href` equals the document AT-URI. A publication page `<link rel="site.standard.publication">` may aid discovery but does not verify the publication.
5. **Standard.site validator:** run the current validator supplied by Standard.site, using its official instructions and the deployed publication/document URLs. Record validator version/URL, timestamp, inputs, and output. Do not put credentials, tokens, CIDs, or article content into a validator submission. If the validator endpoint or invocation changes, follow its current official documentation rather than guessing a command.
6. **Record check:** manually retrieve each record with `getRecord` and compare only metadata fields to the deployed site. Confirm no forbidden content/social fields were sent. Keep returned CIDs in private operator evidence only if needed for troubleshooting; they are not registry identifiers.
7. **Registry update:** after verification, add or update the public registry using the opaque publication/document AT-URIs only. Record the registry URL and resulting revision in private release evidence.

Use a release-evidence entry like this, leaving unperformed checks explicitly pending:

```text
Date/time (UTC): <timestamp>
Operator: <name or handle>
Source commit: <commit>
Local build/verify: <pass/fail and command output reference>
Deployment URL: https://www.marcelinebelardo.com/<path>
Live curl checks: <not run / pass / fail; include status and TLS evidence>
Publication AT-URI: at://did:plc:fakq3c4v2fvivhoc3cgom3nc/site.standard.publication/<rkey>
Document AT-URI(s): <URI-only list>
.well-known verification: <not run / pass / fail>
Document-link verification: <not run / pass / fail>
Standard.site validator: <not run / result and version>
Registry update: <not run / URL and timestamp>
Notes/incidents: <including any InvalidSwap or recovery action>
```

**No live checks are claimed by this document.** At authoring time, operators must fill the evidence fields from actual post-deploy observations; local source inspection is not live verification.

## Rotation, recovery, and safety cautions

- Rotate the dedicated app password after the manual change window, after any suspected exposure, when an operator leaves access, or according to the account's security policy. Revoke the old credential before creating its replacement if the provider requires that order. Repeat the hidden `read -s` flow; never save the new value in this document or a tracked file.
- If login fails, stop and verify the handle, resolved DID, PDS endpoint, app-password status, and account permissions. Do not fall back to the account password, a guessed PDS, or a token copied from logs.
- If a response is malformed, a URI's DID/collection is unexpected, `.well-known` disagrees, the document link points elsewhere, or a live page does not match its record, stop and preserve private evidence for investigation. Do not “repair” by creating duplicates or deleting the publication.
- On `InvalidSwap`, re-read and compare; never force an update without `swapRecord`.
- On a missing record, follow the investigation procedure above. A registry entry, page link, or publication discovery hint is not proof that a record still exists.
- Treat access and refresh tokens, app passwords, session JSON, response files, authorization-header files, and CIDs as sensitive operational material. Clean all of them up at exit and keep public registry entries to opaque AT-URIs.

## References

Consult the current official documents before operating; URLs and validator behavior can change:

- [Standard.site Quick Start](https://standard.site/docs/quick-start)
- [Standard.site Publication lexicon](https://standard.site/docs/lexicons/publication)
- [Standard.site Document lexicon](https://standard.site/docs/lexicons/document)
- [Standard.site Permissions](https://standard.site/docs/permissions)
- [Standard.site Verification](https://standard.site/docs/verification)
- [Standard.site definitions and overview](https://standard.site/#definitions)
- [AT Protocol record keys](https://atproto.com/specs/record-key)
- [AT Protocol repositories](https://atproto.com/specs/repository)
- [Official `@atproto/api` authentication guidance](https://github.com/bluesky-social/atproto/tree/main/packages/api)
- [`com.atproto.identity.resolveHandle` XRPC method](https://docs.bsky.app/docs/api/com-atproto-identity-resolve-handle)
- [`com.atproto.server.createSession` XRPC method](https://docs.bsky.app/docs/api/com-atproto-server-create-session)

The Standard.site Publication and Document links are included as requested references; if either path is unavailable, use the current Standard.site docs navigation and record the replacement URL in private release evidence rather than silently relying on an unverified page.
