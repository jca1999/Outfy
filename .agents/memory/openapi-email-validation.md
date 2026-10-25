---
name: Generated validator compatibility
description: Orval must explicitly target the installed Zod major in this workspace.
---

Keep Orval's Zod output compatible with the installed Zod 3 runtime rather than trusting automatic version detection.

**Why:** Automatic detection emitted Zod 4-only top-level validators (`zod.email()` previously, then `zod.int()` for follow counters). Generation succeeded, but the chained library typecheck failed against the installed Zod 3. Explicitly targeting version 3 resolved generation without changing dependencies.

**How to apply:** Preserve the explicit major-version target when updating the contract or generator; regenerate and run the library typecheck together. Revisit the target only as part of an intentional Zod upgrade.