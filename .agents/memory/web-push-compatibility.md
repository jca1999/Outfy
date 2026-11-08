---
name: Web Push ESM compatibility
description: Runtime exports and DefinitelyTyped declarations may disagree across Web Push major versions.
---

Use the actual installed Web Push package's named exports and verify a real bundle,
not just TypeScript.

**Why:** Web Push 4 is ESM with no default export, while its available DefinitelyTyped
declarations still describe the older API and let a default import typecheck.
Only esbuild caught the incompatibility.

**How to apply:** Inspect runtime exports when upgrading the sender. Prefer named
`sendNotification` imports and preserve a backend build/test that bundles the real
dependency, even though delivery tests themselves must mock external sends.
