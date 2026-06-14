# Watchlist (Follow) Folder — Design Spec
Date: 2026-06-14

## Overview

Add a "Follow" folder type to the portfolio — a watchlist for securities the user wants to buy but doesn't yet own. When adding a security to a watchlist folder, the user specifies which existing folder it should move to after purchase. When the user marks a security as purchased (with purchase details), it moves automatically to the target folder.

---

## Database Changes

### `Folder` model
Add `isWatchlist Boolean @default(false) @map("is_watchlist")`.

### `Holding` model
Add `targetFolderId String? @map("target_folder_id")` — the folder the holding moves to after purchase. Only populated for holdings in watchlist folders.

### Migration
Prisma migration adds both columns. Existing rows default to `false` / `null`.

---

## API Changes

### `POST /api/folders`
Accept optional `isWatchlist: boolean` in request body.

### `POST /api/holdings`
Accept optional `targetFolderId: string` in request body. Required when the target folder is a watchlist.

### `POST /api/holdings/[id]/purchase`  *(new endpoint)*
Body: `{ shares, purchasePrice, purchaseDate, currency }` — same fields as AddLotDialog.  
Actions (in a single DB transaction):
1. Create a `Lot` on the holding.
2. Update the holding: set `folderId = targetFolderId`, clear `targetFolderId`.

---

## UI Changes

### `AddFolderDialog`
Add an "isWatchlist" toggle (checkbox). Label: "Watchlist (Follow) — track securities before buying". Default: off.

### `AddHoldingDialog`
When the selected folder has `isWatchlist = true`, render an additional required field: **"Target folder after purchase"** — a `<select>` listing all non-watchlist folders in the portfolio. The selected folder ID is sent as `targetFolderId`.

### Folder tree / HoldingsTree
Watchlist folders display a 👁 icon next to their name. Holdings inside them show no value/shares (since they have no lots), just ticker + name + target folder badge.

### `FolderPageClient` (watchlist view)
When `folder.isWatchlist === true`:
- Hide value/performance columns.
- Each holding row shows a **"Mark as Purchased"** button.

### `MarkAsPurchasedDialog` *(new component)*
Opens on "Mark as Purchased". Fields: Shares, Purchase Price, Purchase Date, Currency. On submit calls `POST /api/holdings/[id]/purchase`. On success: `router.refresh()` — the holding disappears from the watchlist and appears in its target folder.

---

## Out of Scope
- Editing `targetFolderId` after the holding is created (can delete + re-add).
- Price tracking / alerts for watchlist holdings.
- Converting an existing non-watchlist folder to watchlist.
