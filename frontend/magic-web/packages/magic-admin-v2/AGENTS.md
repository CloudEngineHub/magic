# Magic Admin V2 Open Source Agent Guide

This directory is the open-source Admin V2 package. Before changing pages or components, read `docs/DEVELOPMENT-GUIDE.md` and `docs/UI-DESIGN.md`.

- Keep all product code in `src/`; this package has no enterprise overlay.
- New UI uses shadcn/ui and Tailwind. Do not add Less, CSS Modules, styled-components, or mix Tailwind with antd-style in one component.
- Organize business code under `src/features/<feature-name>/` and keep API/query/mutation/view concerns separate.
- Use static i18n keys and update both `zh_CN` and `en_US` for visible copy.
- Protect routes with `validate` and mutations/actions with `useRights`.
- Run the relevant open-source validation commands and report any unrun checks.
