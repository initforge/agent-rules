# Nostime Decisions

**Scope:** Nostime only. Generic 5fedu decisions → `organization/` or `domains/`.

## Quyết định đã chốt (Nostime-only)

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| No CRM / VIP Consulting | DA_CHOT | Module not built |
| No generic Report module | DA_CHOT | Per Nostime scope |
| No Voucher module | DA_CHOT | |
| No Customer registration / membership | DA_CHOT | Guests don't login |
| Product images = URL paste, no upload | DA_CHOT | |
| 1 product = 1 unique item | DA_CHOT | No quantity management |
| Admin: no Dashboard, redirect to `/san-pham` | DA_CHOT | Luxury brand flow |
| Login pre-filled test credentials | DA_CHOT | `admin@gmail.com` / `5fedu.com` |
| Watch Gear / Royal Oak Bezel SVG icons | DA_CHOT | Brand-specific |
| NXT report: 3 tabs | DA_CHOT | Period summary / Detail / Inventory at point |
| No Inventory by category | DA_CHOT | Only Inventory + NXT Report |
| Account report by period | DA_CHOT | List + Lookup tabs |
| Auto-fill fund account / P&L item on Orders | DA_CHOT | `is_default === true` |
| Repair order → `kd_khach_hang` FK | DA_CHOT | Partner reference |
| Finance categories: no permission filter | DA_CHOT | 2 levels + P&L column |
| Finance report → P&L | DA_CHOT | Month/quarter/year comparison |
| Reviews / Contact | CAN_HOI_THEM | To be reviewed later |

## Open questions

- Public API lookup rate limits?
- Schema drift tracking?
