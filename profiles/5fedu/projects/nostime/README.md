# Nostime Project Context

**Project:** NOSTIME APP — Luxury Watch Retail  
**Stack:** Next.js (legacy App Router) + TypeScript + Supabase  
**Domain:** Luxury retail admin (Rolex, Patek Philippe, Audemars Piguet)  
**Install path:** `<repo>/context/5fedu/` (via installer, profile `nostime`)

## Facts specific to this project

- Luxury watch retail with unique-item inventory management
- Obsidian Dark theme (`#001E15`) + Chrono Gold (`#D4B675`)
- No user registration; guest checkout with local storage cart
- 13 admin routes (san-pham, danh-muc, don-hang, inventory, repairs, etc.)
- Each product = unique serial number, no quantity management
- Image URLs pasted (not uploaded)
- Financial amortization for large expenses
- Payroll: hand-enter formula (base_salary × days/26 × KPI + allowances − deductions)

## Project-local content

`project-local/` contains data the installer never overwrites:
- Nostime-specific Google Sheets spec
- Product inventory rules
- Service order (repair) workflows
- P&L reporting specifications
