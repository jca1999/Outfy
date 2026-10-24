---
name: Toolchain side effects
description: Avoid accidental runtime configuration changes during tightly scoped work.
---

Use the already configured Node runtime for file-processing scripts when infrastructure changes are prohibited.

**Why:** Invoking Python during frontend work caused the environment to automatically add a Python module to `.replit`, despite no deliberate configuration edit.

**How to apply:** Tell helpers not to invoke unconfigured runtimes or install tools under a configuration freeze. Check the infrastructure diff before delivery and remove only known accidental changes introduced by the current work.
