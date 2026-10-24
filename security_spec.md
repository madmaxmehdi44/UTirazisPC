# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants & Relationship Mapping

1. **Global Default-Deny**: All paths not explicitly matched in `firestore.rules` are denied (`allow read, write: if false;`).
2. **Verified Identity Invariant**: All writes require an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`).
3. **PII Split-Collection Isolation**:
   - `/users/{userId}` stores only non-PII public profile preferences (`uid`, `displayName`, `preferredLocale`, `createdAt`, `updatedAt`). Even so, reading and writing are restricted to the document owner (`request.auth.uid == userId`) or a verified admin.
   - `/users/{userId}/private/{docId}` isolates PII (`email`, `phone`, `shippingAddress`, `postalCode`) and requires both parent `/users/{userId}` existence (`get()` Master Gate) and strict owner/admin identity.
4. **PC Build Ownership & Temporal Integrity**:
   - `/pcBuilds/{buildId}` belongs to `ownerId == request.auth.uid`.
   - `ownerId` and `createdAt` are immutable across updates.
   - `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
   - `allow list` enforces `resource.data.ownerId == request.auth.uid` on the server rule itself (never delegated to client filtering).
5. **Admin Tiered Identity**:
   - Admin access requires `isSignedIn() && request.auth.token.email_verified == true && (exists(/databases/$(database)/documents/admins/$(request.auth.uid)) || request.auth.token.email == 'madmaxmehdi44@gmail.com')`.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 — Shadow Field Injection on UserProfile Create**:
   `{ "uid": "user_1", "displayName": "Ali", "preferredLocale": "fa", "isAdmin": true, "createdAt": "SERVER_TIME", "updatedAt": "SERVER_TIME" }` -> Rejected by `hasOnly()` key allowlist.
2. **Payload 2 — Unverified Email Spoofing on AdminConfig**:
   Auth token with `email: "madmaxmehdi44@gmail.com"`, `email_verified: false` writing to `/adminSettings/main` -> Rejected by `isVerifiedUser()` gate.
3. **Payload 3 — Cross-User PII Read on `/users/victim_1/private/info`**:
   Authenticated as `attacker_1` attempting `get` on `/users/victim_1/private/info` -> Rejected by `isOwner(userId)` check.
4. **Payload 4 — Orphaned Subcollection Write on `/users/nonexistent_user/private/info`**:
   Authenticated as `nonexistent_user` attempting to create `/users/nonexistent_user/private/info` before `/users/nonexistent_user` exists -> Rejected by Master Gate `exists(/databases/$(database)/documents/users/$(userId))`.
5. **Payload 5 — ID Poisoning on `/pcBuilds/{buildId}`**:
   Document ID containing 500 characters or special path characters `$@#` -> Rejected by `isValidId(buildId)`.
6. **Payload 6 — Value Poisoning on `SavedPcBuild.title`**:
   Updating `title` to a 10,000-character string or a boolean -> Rejected by `isValidSavedPcBuild(incoming())` which wraps the entire `allow update` block.
7. **Payload 7 — Ownership Hijack (`ownerId` Mutation)**:
   Updating `ownerId` on `/pcBuilds/build_1` from `user_1` to `user_2` -> Rejected by `incoming().ownerId == existing().ownerId` and `affectedKeys().hasOnly(...)`.
8. **Payload 8 — Forged Client Timestamp (`createdAt` Backdating)**:
   Creating a build with `createdAt: Timestamp.fromMillis(1000000)` instead of `request.time` -> Rejected by `incoming().createdAt == request.time`.
9. **Payload 9 — Immortal Field Mutation (`createdAt` Modification on Update)**:
   Updating `createdAt` during an update operation -> Rejected by `incoming().createdAt == existing().createdAt` and `affectedKeys().hasOnly(...)`.
10. **Payload 10 — Blanket List Scraping on `/pcBuilds`**:
    Executing an unconstrained collection query on `/pcBuilds` without `where('ownerId', '==', uid)` -> Rejected by `allow list: if isVerifiedUser() && resource.data.ownerId == request.auth.uid;`.
11. **Payload 11 — Invalid Compatibility Enum State**:
    Creating a `SavedPcBuild` with `compatibilityStatus: "hacked_status"` -> Rejected by enum allowlist `['compatible', 'warning', 'incompatible', 'unverified']`.
12. **Payload 12 — Unauthorized Admin Settings Mutation**:
    Standard verified customer attempting to update `/adminSettings/main` -> Rejected by `isAdmin()` gate.

---

## 3. Red Team Audit & Conflict Report

- **Identity Spoofing**: Blocked on all collections via `incoming().uid == request.auth.uid` and `incoming().ownerId == request.auth.uid` plus `request.auth.token.email_verified == true`.
- **State Shortcutting**: Blocked via strict `enum` checks on `preferredLocale`, `compatibilityStatus`, and `activeProvider`.
- **Resource Poisoning**: Blocked via `isValidId()` regex/length checks on all single-document path variables and explicit `.size()` bounds on every string field.
- **Update Validation Helper Wrapping**: Every `allow update` block begins with `isValid[Entity](incoming())` and partitions mutations into explicit action branches with `affectedKeys().hasOnly(...)`.
