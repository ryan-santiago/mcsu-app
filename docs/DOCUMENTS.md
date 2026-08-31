# One-Lot Project Docs — architecture and SharePoint integration

A file-explorer tab (upload, folders, rename, delete, move via drag-and-drop,
multi-select, sort, search, preview) on each One-Lot Project. Storage is
**SharePoint (Microsoft Graph), DONE as of 2026-08-31** — see "SharePoint
implementation" below. Read this before touching `src/lib/document-storage.ts`,
`src/server/one-lot-projects/document-*`, or the Graph client itself.

---

## SharePoint implementation — DONE (2026-08-31)

`src/lib/document-storage.ts` is Graph-backed, sharing its app-only token
helper (`src/lib/graph-client.ts`) with the email integration
(`docs/EMPLOYEE_RECOMMENDATION.md` §13) — same Entra ID app registration,
`Sites.Selected` scoped to one site. A connectivity probe (token → resolve
site → resolve drive → create nested folders → upload → read back → delete)
ran clean against the real DEV site before this was marked done, confirming
in particular that Graph's simple `PUT .../content` does **not** auto-create
missing intermediate folders — `saveDocumentFile()` walks and creates each
missing folder segment first (`ensureFoldersExist()` / `createFolderIfMissing()`),
tolerating a 409 `nameAlreadyExists` from a racing request.

- `isDocumentStorageAvailable()` now checks Graph is configured
  (`AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`) and a site is
  resolvable (`SHAREPOINT_SITE_ID`, or `SHAREPOINT_SITE_HOSTNAME` +
  `SHAREPOINT_SITE_PATH`) — no longer `!process.env.VERCEL`. Local disk is
  fully retired, not kept as a fallback.
- The site's drive is matched by `SHAREPOINT_DRIVE_NAME` (default
  `"Documents"`) against `/sites/{id}/drives`, falling back to the site's
  default drive if no name matches.
- `storageKey`'s leading `Documents/` segment is stripped before building a
  Graph-relative path — the resolved drive's root already **is** that
  library's root, so keeping the prefix would nest a redundant `Documents/`
  folder inside the `Documents` library. The DB column and its value are
  unchanged; only the Graph-facing translation knows about this.
  `sanitizeDocumentName()` also strips SharePoint's reserved filename
  characters (`" * : < > ? |`), on top of `/` and `\`.
- Files ≤4MB use a simple `PUT .../root:/{path}:/content`; larger files
  (up to `MAX_FILE_SIZE_BYTES` = 50MB) use `createUploadSession` + chunked
  `PUT`s (10MB chunks, a multiple of 320 KiB) — the returned `uploadUrl` is
  pre-authenticated by Graph and deliberately bypasses this app's Bearer
  token (see `graph-client.ts`'s `graphFetch()` doc comment).
- Downloads stream through `GET .../root:/{path}:/content`, letting `fetch`
  follow Graph's redirect to the actual (pre-signed) content URL.

### Why not literally `public/`

The storage root conceptually maps to `<SharePoint Site>/Documents/...`,
never `public/`: Next.js serves everything under `public/` statically with
**no auth check at all**. Every access instead goes through the
authenticated route handler
(`src/app/api/one-lot-projects/[id]/documents/[documentId]/route.ts`), which
re-checks the caller's session and project content access on every request —
same guarantee every other page/action in this app gets from
`assertOneLotProjectContentAccess`. SharePoint's own permission model on the
document library is not relied on for this — the app-only Graph credential
has blanket access to the site, and RBAC is enforced entirely on this app's
side, same as it always was.

---

## Path convention

`storageKey` (`oneLotProjectDocument.storageKey`, produced by
`buildDocumentStorageKey()` in `one-lot-project-document-format.ts`):

```
Documents/One-Lot Project/{projectId}/documents/{documentId}-{fileName}
```

`Documents/` is the SharePoint library itself, stripped by
`document-storage.ts`'s `toGraphPath()` before every Graph call (see
"SharePoint implementation" above) — the actual location on the site is:

```
<SharePoint Site>/Documents/One-Lot Project/{projectId}/documents/{documentId}-{fileName}
```

`documentId` prefixes the stored filename so two same-named files (different
folders, or a file renamed to match another) never collide on disk — the
`name` column is what users see and rename; the storage key never changes
after upload.

---

## Data model

One self-referencing table holds the whole tree, folders and files together —
same `parentId` convention `oneLotProjectWorkItem` uses for subtasks:

```
oneLotProjectDocument
  id, projectId, parentId (null = root)
  type            "folder" | "file"
  name            what the user sees, renames, searches by
  storageKey      null for folders — relative path under the storage root
  mimeType, size  null for folders
  uploadedBy, createdAt, updatedAt
```

Name-uniqueness within a folder is enforced at the application layer
(query-then-insert in `document-actions.ts`'s `assertNameAvailable`), the
same convention `backlog-actions.ts` uses for sprint item codes — Postgres
would treat every `parentId IS NULL` row as distinct from every other, so a
plain unique index wouldn't even catch duplicate names at the document root.

**Folders are pure metadata.** There's no real SharePoint folder created per
DB folder — physical storage is flat (every file sits directly under
`.../documents/` in the SharePoint library), and the folder hierarchy the
user sees (including drag-and-drop move between folders) is entirely a
`parentId` chain in the database, never reflected in SharePoint's own folder
tree. Deleting a folder cascades the DB rows (`onDelete: "cascade"`) and
then walks the resulting subtree (`listDescendantFiles` in
`document-queries.ts`) to clean up the corresponding SharePoint files, which
the cascade itself doesn't know about.

---

## Request flow

### Upload

```
Browser → <input type=file> (or drag-drop) → FormData(projectId, parentId, file)
        → uploadOneLotProjectDocument()   server action, "use server"
        → authorizeActiveUser() + assertOneLotProjectContentAccess()
        → buildDocumentStorageKey()       one-lot-project-document-format.ts
        → saveDocumentFile()              document-storage.ts — uploads to SharePoint via Graph
        → db.insert(oneLotProjectDocument)
        → recordAudit() + revalidatePath()
```

Uploads go through a plain Server Action, not a Route Handler. Next.js caps
Server Action bodies at **1MB by default regardless of host**, so
`next.config.ts` raises it:

```ts
experimental: { serverActions: { bodySizeLimit: "50mb" } }
```

matching `MAX_FILE_SIZE_BYTES` in `document-actions.ts`. Storage no longer
depends on a persistent local filesystem, so this feature is no longer
Vercel-incompatible on that front — but if this app is ever deployed to
real Vercel serverless functions, uploads would still hit Vercel's own
~4.5MB *request body* limit on the function itself, which `next.config.ts`
cannot override. That would need bouncing the file straight from the
browser to storage (a Graph upload session's `uploadUrl` can be handed to
the browser directly, same shape as the Vercel Blob approach this feature's
first implementation used and tore out) instead of routing every byte
through a server function. Not built until that's an actual deployment
target.

### Download / preview

```
Browser → GET /api/one-lot-projects/{id}/documents/{documentId}
        → getCurrentUser() + getOneLotProjectDocumentById()   re-checks access, every request
        → readDocumentFile()                                  document-storage.ts — streams from SharePoint via Graph
        → Response(stream, { Content-Type, Content-Disposition })
```

The one Route Handler in this feature, because a Server Action can't be
`<a href>`'d or opened in a new tab with custom headers. `?download=1` forces
`Content-Disposition: attachment`; otherwise it's `inline` and the browser
decides what to do with it:

- **PDF, images, plain text** — rendered natively, in-tab. This is the
  entirety of "opens in the browser" for these types; nothing else was built
  for them because the browser already does it correctly.
- **DOCX / XLSX / PPTX** — no browser can render these natively, so
  `inline` has no effect and it downloads like any other unrecognized type.
  Whether an installed app (Word, Excel, LibreOffice, ...) then opens it is
  entirely the **operating system's** file-association behavior — a web
  server has no way to detect what's installed on the client machine, and
  none was faked here. **What SharePoint/OneDrive actually do instead** —
  and what this doesn't do yet — is render Office documents in-browser via
  Microsoft's Office Online Viewer
  (`https://view.officeapps.live.com/op/view.aspx?src=<url>`), which needs a
  URL Microsoft's servers can fetch independently. That's incompatible with
  keeping every document private-by-default the way this implementation
  does, and doubly moot for local disk (no public URL exists for it to fetch
  at all). If in-browser Office preview becomes a real requirement, the
  correct place to add it is *after* the SharePoint migration — Graph API's
  `/preview` endpoint (see below) does exactly this and is already
  access-scoped correctly, with no separate exposure decision needed.

---

## Explorer-like UI — DONE (2026-08-31)

On top of the original upload/folder/rename/delete/preview set, the Docs
tab (`one-lot-project-documents-explorer.tsx`, `document-row.tsx`) now has:

- **Multi-select** — row checkboxes plus a header select-all
  (checked/indeterminate/unchecked), with a bulk action bar (Download,
  Delete) replacing the New folder/Upload controls while any selection is
  active.
- **Move via drag-and-drop** — dragging a row onto a folder row, or onto any
  breadcrumb (including the "Documents" root), calls the new
  `moveOneLotProjectDocument` server action. Guards against dropping a
  folder into itself or one of its own descendants
  (`isSelfOrAncestor()` in `document-actions.ts`) and against a name
  collision at the destination (`assertNameAvailable`, same check upload/
  rename/create-folder already use). Internal drags are scoped to a private
  `application/x-mcsu-document-id` DataTransfer type so they never trip the
  existing OS-file drag-and-drop-to-upload handling on the same table.
- **Column sorting** — click Name/Modified/Size to sort; folders always
  group before files regardless of sort column, matching the convention
  `document-queries.ts`'s default ordering already used.
- **Search** — a client-side name filter scoped to the current folder's
  already-fetched items (no new query).

`document_moved` was added to `audit-registry.ts` alongside the other
`one_lot_projects` document actions so moves show up in Audit Trail
automatically, same as every other Edit/Delete in this feature.

---

## IT asks — fulfilled (2026-08-31)

What was requested, and what came back — kept as a record in case a second
site/environment needs the same asks repeated later:

1. **Site and library.** DEV site
   `https://questronixcomph.sharepoint.com/sites/MCSUConsoleDev`, default
   `Documents` library, standard template — no separate site collection.
2. **Entra ID (Azure AD) app registration** — Client ID, Tenant ID, Client
   secret (`AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET`).
   Microsoft Graph **application** permission `Sites.Selected`, with admin
   consent granted tenant-wide, PLUS a **per-site grant** (via
   `Grant-PnPAzureADAppSitePermission`) scoping actual access to just this
   one site — `Sites.Selected` alone grants nothing until that per-site
   step happens, which is what actually unblocked this (see
   `sharepoint-integration-status` in project memory for the exact
   diagnosis, if this needs repeating on a second site).
3. Same app registration reused for `Mail.Send`
   (`docs/EMPLOYEE_RECOMMENDATION.md` §13) rather than a second
   registration — both scopes tightly bounded individually (one site;
   `mcsu_automations@questronix.com.ph` only), so combining them didn't
   meaningfully raise the blast radius of a leaked secret.
4. Confirmed via the connectivity probe run before this was marked done,
   not asked about separately: no Conditional Access policy blocked the
   app-only calls from this dev machine, and no throttling was hit.
5. Compliance/retention and the SharePoint path-length limit: not yet
   separately confirmed with IT — worth a follow-up before production
   rollout, but nothing in dev usage has hit either.
