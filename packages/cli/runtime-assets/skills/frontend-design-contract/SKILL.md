---
name: frontend-design-contract
description: "Author/adhere to an approved project design contract or explicit brief vs generic UI defaults."
metadata:
  signals: "project design contract, design contract, design brief, brand identity direction, visual identity direction"
  excludes: "5fedu, ERP module, parity, drawer, listview, toolbar"
  priority: "35"
  platform_scope: "all"

---
# frontend-design-contract

## Discovery

Inspect the approved brief or design contract together with the active theme,
tokens, components, typography, assets and representative product surfaces.
Extract only constraints relevant to the requested seam: audience, hierarchy,
brand rules, interaction expectations, accessibility and responsive behavior.

## Authority

The approved contract overrides generic frontend or taste defaults. Existing
product source is evidence of that contract, not a reason to invent a new
visual world. If the brief conflicts with a public behavior, permission or
accessibility requirement, surface the conflict before implementation.

## Implement and prove

Materialize the applicable constraints in the active plan, then let the selected
upstream implementation/design skill and repository source choose local structure. Use visual/browser
proof only when acceptance claims a rendered state; otherwise run the narrowest
repository-native proof. Stop or ask before changing the approved identity,
public content, product behavior or acceptance.
