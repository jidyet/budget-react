# Lender logo asset provenance

UX-8.4. Every file in this directory was downloaded exactly once during development from Wikimedia Commons and is bundled locally — TrackToZero makes zero runtime network requests for lender logos (see `LenderIdentity.jsx`, which renders these as local `import`ed assets with an `onError` fallback to the UX-8.3 initials badge, never a remote URL).

Every file below carries Wikimedia Commons' own **`PD-textlogo`** (or, for Navy Federal, explicit **CC0 1.0 Universal**) classification: the file does not meet the US copyright "threshold of originality" as a simple geometric/text mark, so no copyright license is required to reproduce it. Every file also carries Wikimedia's standing **trademark notice**: the institution's name/mark remains a protected trademark in the relevant jurisdictions. TrackToZero's use here is identification-only (naming which real-world institution a Debt belongs to) — the exact identical name is never used to imply partnership, sponsorship, endorsement, or affiliation (no "Official partner"/"Supported by"/"Verified lender" copy exists anywhere in the product, per the UX-8.3 discipline this phase preserves).

No file was redrawn, approximated, or recreated — each is the exact, unmodified vector artwork downloaded from Wikimedia Commons' own file storage (`upload.wikimedia.org`), fetched once for this development pass and never hotlinked at runtime.

| Local file | Lender | Wikimedia Commons file page | Raw source URL | License tag |
|---|---|---|---|---|
| `bank-of-america.svg` | Bank of America | [File:Bank of America logo.svg](https://commons.wikimedia.org/wiki/File:Bank_of_America_logo.svg) | `upload.wikimedia.org/wikipedia/commons/2/20/Bank_of_America_logo.svg` | PD-textlogo + trademark notice |
| `capital-one.svg` | Capital One | [File:Capital One logo.svg](https://commons.wikimedia.org/wiki/File:Capital_One_logo.svg) | `upload.wikimedia.org/wikipedia/commons/9/98/Capital_One_logo.svg` | PD-textlogo + trademark notice |
| `chase.svg` | Chase | [File:Chase logo 2007.svg](https://commons.wikimedia.org/wiki/File:Chase_logo_2007.svg) | `upload.wikimedia.org/wikipedia/commons/e/ed/Chase_logo_2007.svg` | PD-textlogo + trademark notice |
| `us-bank.svg` | U.S. Bank | [File:US Bank logo 2023 color.svg](https://commons.wikimedia.org/wiki/File:US_Bank_logo_2023_color.svg) | `upload.wikimedia.org/wikipedia/commons/f/ff/US_Bank_logo_2023_color.svg` | PD-textlogo + trademark notice |
| `wells-fargo.svg` | Wells Fargo | [File:Wells Fargo Logo (2020).svg](https://commons.wikimedia.org/wiki/File:Wells_Fargo_Logo_(2020).svg) | `upload.wikimedia.org/wikipedia/commons/e/e2/Wells_Fargo_Logo_(2020).svg` | PD-textlogo + trademark notice |
| `discover.svg` | Discover | [File:Discover Card logo.svg](https://commons.wikimedia.org/wiki/File:Discover_Card_logo.svg) | `upload.wikimedia.org/wikipedia/commons/5/57/Discover_Card_logo.svg` | PD-textlogo + trademark notice |
| `navy-federal.svg` | Navy Federal Credit Union | [File:Navy Federal Credit Union Logo.svg](https://commons.wikimedia.org/wiki/File:Navy_Federal_Credit_Union_Logo.svg) | `upload.wikimedia.org/wikipedia/commons/3/3c/Navy_Federal_Credit_Union_Logo.svg` | CC0 1.0 + trademark notice |
| `affirm.svg` | Affirm | [File:Affirm 2023 logo.svg](https://commons.wikimedia.org/wiki/File:Affirm_2023_logo.svg) | `upload.wikimedia.org/wikipedia/commons/0/02/Affirm_2023_logo.svg` | PD-textlogo + trademark notice |
| `sofi.svg` | SoFi | [File:SoFi logo.svg](https://commons.wikimedia.org/wiki/File:SoFi_logo.svg) | `upload.wikimedia.org/wikipedia/commons/1/16/SoFi_logo.svg` | PD-textlogo + trademark notice |
| `citi.svg` | Citi | [File:Citi logo March 2023.svg](https://commons.wikimedia.org/wiki/File:Citi_logo_March_2023.svg) | `upload.wikimedia.org/wikipedia/commons/7/73/Citi_logo_March_2023.svg` | PD-textlogo + trademark notice |
| `american-express.svg` | American Express | [File:American Express logo (2018).svg](https://commons.wikimedia.org/wiki/File:American_Express_logo_(2018).svg) | `upload.wikimedia.org/wikipedia/commons/f/fa/American_Express_logo_(2018).svg` | PD-textlogo + trademark notice |

Fetched: 2026-08-17.

## Lenders deliberately left fallback-only (no asset added)

Searched Wikimedia Commons directly; no dedicated logo file exists for these institutions there. Rather than source from a lower-provenance location (icon aggregators, unclear-rights sites — explicitly disallowed), these lenders continue to use the UX-8.3 initials fallback:

- MOHELA
- Firstmark Services
- Nelnet
- Aidvantage
- Navient
- Sallie Mae
- AES
- PayPal Credit
- Apple Card
- Synchrony
- PenFed
- Ally
- Santander
- Toyota Financial
- Ford Credit
- LendingClub
- Upstart

This list can grow if a genuinely appropriate, similarly-documented asset is identified later — the registry/component architecture requires no structural change to add one (set `logoAsset` on the entry in `lenderRegistry.js`).
