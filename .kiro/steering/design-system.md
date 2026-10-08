---
inclusion: always
---
# Design system rules (perceptionmanager)


This product uses the shared perceptionmanager design tokens (`--pm-*`), loaded from the design-system repo's `dist/tokens.css`.

## Always
- Use semantic tokens for every color, font size, spacing, radius, shadow, duration and z-index, e.g. `var(--pm-color-text-secondary)`, `var(--pm-space-6)`, `var(--pm-radius-lg)`.
- Use a type role for text: `.pm-text-body`, `.pm-text-heading-md`, … or the matching `--pm-type-<role>-*` variables.
- Put product CSS in its own cascade layer after `tokens` (`@layer tokens, base, components, product;`).
- Wrap looping or ambient animation in `@media (prefers-reduced-motion: no-preference)`.

## Never
- Raw hex/rgb colors, px font sizes, or spacing values off the 4px scale in product CSS.
- Primitive tokens (`--pm-color-neutral-*`, `--pm-color-alpha-*`) in product CSS. Use the semantic role instead.
- Text smaller than `--pm-type-caption-size` (12px).
- New tokens added locally. Propose them in the design-system repo, where `npm run validate` checks them.

## Exceptions
Data visualization colors and device-frame geometry may stay local. Comment why.
