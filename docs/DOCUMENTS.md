# One-Lot Project Docs — architecture and SharePoint migration

A file-explorer tab (upload, folders, rename, delete, preview) on each
One-Lot Project. Storage is a **stand-in** — a fixed integration point is
already reserved for a future SharePoint document library. Read this before
touching `src/lib/document-storage.ts`, `src/server/one-lot-projects/document-*`,
or the SharePoint integration itself.

---

## Current state: local disk, not SharePoint, not Vercel Blob

Files live on local disk, under a directory shaped like the eventual
SharePoint path (see below). This was a deliberate, considered choice, not
the default — two things ruled out the alternatives:

- **Not SharePoint yet** — no Entra ID app registration, no Graph API
  credentials, no agreed site/library exist yet. See "What to get from IT"
  below for exactly what unblocks this.
- **Not Vercel Blob** — the first implementation of this feature used it
  (browser uploads directly to Blob storage, `access: "private"`, streamed
  back through an authenticated route handler). It was torn out because this
  app's current deployment target may move off Vercel to a persistent host
  (self-hosted or EC2) before SharePoint is ready, and local disk is simpler
  and free until that's settled. If Vercel is confirmed as the long-term
  target instead, that implementation is the one to resurrect — the
  `document-storage.ts` abstraction below is exactly the seam for it.

**This only works on a persistent filesystem.** Vercel serverless functions
don't persist local writes between requests or across instances — anything
written to disk (`public/` included) vanishes unpredictably. Every read/write
path in this feature checks `isDocumentStorageAvailable()`
(`src/lib/document-storage.ts`) first:

```ts
export function isDocumentStorageAvailable(): boolean {
  return !process.env.VERCEL;
}
```

`process.env.VERCEL` is set automatically in every Vercel runtime, so this
needs no configuration — it just refuses (page shows an explanatory
`EmptyState`, actions return a plain error) rather than silently losing an
upload. **If this app is deployed to Vercel while still on local disk, Docs
degrades to "not available here" instead of eating files.** Don't remove this
guard without replacing the storage backend first.

### Why not literally `public/`

The user's original request was to store files under `Public/Documents/...`.
The actual storage root is `storage/Documents/...` — one directory up from
`public/` — on purpose: Next.js serves everything under `public/` statically,
with **no auth check at all**. Putting real documents there would mean anyone
who saw or guessed a file's path could read it, bypassing this app's RBAC
entirely. Keeping the real files outside `public/` and only ever reaching
them through the authenticated route handler
(`src/app/api/one-lot-projects/[id]/documents/[documentId]/route.ts`) means
every single access re-checks the caller's session and project content
access, same guarantee every other page/action in this app gets from
`assertOneLotProjectContentAccess`.

---

## Path convention (matches the SharePoint plan exactly)

```
storage/Documents/One-Lot Project/{projectId}/documents/{documentId}-{fileName}
         └──────────────────────────────────────────────────────────────────┘
         This half is the part that's supposed to survive the migration —
         see `projectDocumentsPrefix()` in one-lot-project-document-format.ts.
```

The plan this is standing in for:

```
<SharePoint Site>/Documents/One-Lot Project/{projectId}/documents
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

**Folders are pure metadata.** There's no real directory created on disk per
folder — the physical storage is flat (every file sits directly under
`.../documents/`), and the folder hierarchy the user sees is entirely a
`parentId` chain in the database. Deleting a folder cascades the DB rows
(`onDelete: "cascade"`) and then walks the resulting subtree
(`listDescendantFiles` in `document-queries.ts`) to clean up the
corresponding on-disk files, which the cascade itself doesn't know about.

---

## Request flow

### Upload

```
Browser → <input type=file> → FormData(projectId, parentId, file)
        → uploadOneLotProjectDocument()   server action, "use server"
        → authorizeActiveUser() + assertOneLotProjectContentAccess()
        → buildDocumentStorageKey()       one-lot-project-document-format.ts
        → saveDocumentFile()              document-storage.ts — writes to disk
        → db.insert(oneLotProjectDocument)
        → recordAudit() + revalidatePath()
```

Uploads go through a plain Server Action, not a Route Handler — safe only
because this feature never runs on Vercel (see the guard above). Next.js
caps Server Action bodies at **1MB by default regardless of host** (not a
Vercel-specific limit), so `next.config.ts` raises it:

```ts
experimental: { serverActions: { bodySizeLimit: "50mb" } }
```

matching `MAX_FILE_SIZE_BYTES` in `document-actions.ts`. If this were ever
deployed to real Vercel serverless functions, uploads would additionally hit
Vercel's own ~4.5MB *request body* limit, which `next.config.ts` cannot
override — that's the actual reason the first implementation had to bounce
the file straight from the browser to Vercel Blob instead of through a
server function at all. Resurrect that pattern if the deployment target
becomes Vercel for real; don't just raise this number and assume it's fixed.

### Download / preview

```
Browser → GET /api/one-lot-projects/{id}/documents/{documentId}
        → getCurrentUser() + getOneLotProjectDocumentById()   re-checks access, every request
        → readDocumentFile()                                  document-storage.ts — streams from disk
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

## What changes when SharePoint integration lands

The seam is intentionally narrow. Everything **outside** these two files
should need zero changes:

| Stays the same | Changes |
| --- | --- |
| `oneLotProjectDocument` schema, `parentId` tree | `storageKey`'s meaning: relative disk path → SharePoint drive-item ID or path |
| `document-queries.ts` (folder listing, breadcrumbs) | `src/lib/document-storage.ts`'s implementation — swap `fs/promises` calls for Graph API calls |
| `document-actions.ts`'s auth/validation/audit logic | The download route handler's file-read step — swap `readDocumentFile()` for a Graph API content stream |
| The whole UI (`documents/` component folder) | `isDocumentStorageAvailable()` — becomes "is the Graph API credential configured," not "are we off Vercel" |

Rename `storageKey` to something SharePoint-shaped only if it stops being a
plain relative path (e.g. becomes a drive-item ID) — otherwise the column
and the concept survive unchanged.

---

## What to get from your Internal IT team

Concrete asks, in the order you'll need them:

1. **Confirm the target site and library.** The exact SharePoint site URL
   (e.g. `https://questronix.sharepoint.com/sites/MCSU`) and confirmation
   that a **"Documents" library** with a **"One-Lot Project" folder** at its
   root is the agreed structure — or get them to create it if not. Ask
   whether they want a *separate* site collection for this vs. reusing an
   existing team site's default library.

2. **An Entra ID (Azure AD) app registration**, specifically:
   - **Client ID** (Application ID) and **Tenant ID**.
   - **Client secret** or (better, for anything long-lived) a **certificate**
     for authentication — client secrets expire and need manual rotation;
     ask IT which their policy allows.
   - **API permissions**: Microsoft Graph, **application** permissions (not
     delegated — this is a backend service acting on its own, not on behalf
     of a signed-in user). At minimum `Sites.Selected`, scoped by an admin to
     *only* the MCSU site above — ask specifically for `Sites.Selected`
     rather than `Sites.ReadWrite.All`, which grants access to every
     SharePoint site in the tenant and is far more than this needs.
   - **Admin consent granted** on those permissions — a normal user can't
     consent to application-level Graph permissions themselves.

3. **Confirm throttling and Conditional Access exposure.** Ask whether any
   Conditional Access policies (IP allow-listing, MFA-for-apps) would block
   an unattended service principal making Graph API calls from this app's
   hosting environment, and what Graph API throttling limits apply to the
   tenant (matters once uploads/downloads are frequent).

4. **Confirm compliance/retention settings already on that site** —
   versioning policy, retention labels, DLP rules — that this integration
   needs to respect rather than fight. In particular: SharePoint's total URL
   path length limit (~400 characters) is worth checking against
   `Documents/One-Lot Project/{projectId}/documents/{documentId}-{fileName}`
   for your longest realistic project names/filenames.

5. **A non-production site or library to develop against first** — so the
   integration can be built and tested without touching whatever the real
   MCSU SharePoint site ends up holding.

Once those five are in hand, the actual code change is: implement
`saveDocumentFile` / `deleteDocumentFile` / `readDocumentFile` in
`document-storage.ts` against Microsoft Graph's
`/sites/{site-id}/drive/root:/{path}:/content` upload/download endpoints
instead of `node:fs`, and flip `isDocumentStorageAvailable()` to check for
the Graph credential instead of `!process.env.VERCEL`.
