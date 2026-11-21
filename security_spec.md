# Security Specification (Phase 0)

## 1. Data Invariants
1. Global default-deny rule blocks all unmatched document reads and writes.
2. Only verified authenticated users (`request.auth != null && request.auth.token.email_verified == true`) can interact with Firestore.
3. `/appConfig/security` (PIN hash & salt) is readable/writable ONLY by the verified teacher (`teacherUid == request.auth.uid`) or bootstrapped admin (`pradipmallick635343@gmail.com`), never by student accounts.
4. Initial PIN creation (`/appConfig/security` & `/appConfig/public`) is permitted only when `/appConfig/security` does not already exist, preventing overwrite hijacking.
5. `accessRequests/{deviceId}` can only be created by the requesting user (`requesterUid == request.auth.uid`) with `status == 'pending'`, a valid `requestedClassId` (`class-6` through `class-12`), and optional `requestedSubjectIds` (strictly limited to `class-11` or `class-12` requests, max 20 items); only the teacher can mark `status == 'denied'` or approve into `/permittedDevices/{deviceId}` with a valid `permittedClassId`.
6. `permittedDevices/{deviceId}` can only be created, updated (for `permittedClassId`/`permittedSubjectIds`/`label`/`approvedAt`), or deleted by the teacher (`isTeacher()`), ensuring students cannot escalate or alter their permitted class or permitted subjects, and `permittedSubjectIds` is only valid for `class-11` or `class-12`.
7. `subjects` and `chapters` writes are restricted strictly to the teacher (`isTeacher()`), and `list` queries never invoke `get()` or `exists()`.
8. `pdfFiles/{pdfId}` and `pdfFiles/{pdfId}/chunks/{chunkId}` writes are restricted strictly to `isTeacher()`, require `get()` Master Gate verification on chunks, and expose only deterministic `get` reads to verified signed-in users.

## 2. Dirty Dozen Payloads (Must Return PERMISSION_DENIED)
1. Unauthenticated read of `/appConfig/public` -> DENIED.
2. Unverified email user writing `/accessRequests/dev_1` -> DENIED.
3. Student user reading `/appConfig/security` -> DENIED.
4. Student user overwriting `/appConfig/public` with `{ teacherUid: studentUid }` -> DENIED.
5. Student user creating `/accessRequests/dev_1` with `{ status: 'approved' }` -> DENIED.
6. Student user creating `/accessRequests/dev_1` with invalid `{ requestedClassId: 'all' }` -> DENIED.
7. Student user creating `/accessRequests/dev_1` with spoofed `{ requesterUid: otherUid }` -> DENIED.
8. Student user updating `/accessRequests/dev_1` with ghost field `{ isApproved: true }` -> DENIED.
9. Student user creating or updating `/permittedDevices/dev_1` to set `{ permittedClassId: 'class-12' }` -> DENIED.
10. Student user creating or deleting `/subjects/bengali` -> DENIED.
11. Student user creating or deleting `/chapters/ch1` -> DENIED.
12. Student user writing `/pdfFiles/p1` or `/pdfFiles/p1/chunks/0`, or injecting oversized >128 char ID `/accessRequests/<200 chars>` -> DENIED.
