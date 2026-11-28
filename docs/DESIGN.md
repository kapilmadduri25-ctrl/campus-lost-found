# Design notes

LOSTLY is a campus lost-and-found board, so the interface borrows from the physical
world it replaces: noticeboards, luggage tags, paper forms and rubber stamps. Everything
below is a rule, not a preference.

## The rule: six materials, six jobs

Six visual languages on one site only works if each owns a role. Every element is
assigned exactly one:

| Material | Owns | Why it belongs there |
|---|---|---|
| **Liquid glass** | Floating layers — nav, toasts, the auth shell, the hero panel | the things that hover over the page should look like they are hovering: two specular bands, a hairline rim, 26px blur |
| **Glass** | Content surfaces — cards, tables, panels | translucency separates layers without adding weight; the page keeps its paper feel |
| **Neumorphism** | Quiet controls — outline buttons, inputs, chips | a control should look pressable; the inset shadow tells you where to type |
| **Claymorphism** | Friendly accents — empty states, stat cards, hero steps, notification rows, pills | thick soft shadows and a warm fill read as approachable, which matters on an empty board |
| **Blobmorphism** | Organic shape — the background field, the avatar, the match score | the only places a non-geometric silhouette is justified |
| **Skeuomorphism** | Physical details — paper grain, the tape on a card, the returned-listing stamp | a found item is a physical object |
| **Neubrutalism** | Loud actions — primary CTAs and the mobile menu only | a forest-inked 1.5px border and a 3px offset shadow: reserved for the two things that should shout. Status badges were tried here first and reverted — a hard black outline on every card is noise, not hierarchy |

**The hierarchy rule:** an element is either **loud** (neubrutalism) or **quiet**
(neumorphism) — never both. Primary actions shout; everything else whispers. Mixing all
seven onto one surface is what makes an interface look like a mock-up rather than a
product. Assigned by role, they read as one material world.

Files: `tokens.css` (colour, type, spacing) → `depth.css` (glass, neumorphism, paper) →
`expressive.css` (liquid glass, clay, blob, neubrutalism) → `components.css` →
`layout.css` → `pages.css`. Later files win, which is why the order in every page's
`<head>` matters.

Files: `public/css/tokens.css` (colour, type, spacing), `depth.css` (glass, neumorphism,
paper), `components.css` (the components themselves), `layout.css` (page frame),
`pages.css` (page-specific).

## No emoji

Every icon is an inline SVG from one set in `public/js/ui.js`, at one stroke weight, drawn
in `currentColor` so it inherits the text colour and can be sized by font-size. Emoji were
the loudest tell that the page was generated: they render differently on every platform,
cannot be tinted, and sit on their own baseline.

Icons: `electronics, books, id, wallet, keys, clothing, accessories, sports, bags, other,
pin, search, flag, check, clock, user, shield, calendar, moon, sun, menu, lock, alert, empty`.

## No invented data

The home page hero is a single panel listing the three newest real listings, each a link.
When the board is empty it explains the three steps instead of showing fake cards. Nothing
on the site displays sample content that is not in the database.

An earlier version floated three rotated, overlapping cards in the hero. They were replaced:
three absolute-positioned cards collide as soon as their content changes length, and the
rotation was decoration for its own sake.

## Accessibility that is not decoration

- Every control has a visible focus ring (`:focus-visible`), never `outline: none` alone.
- Errors are `role="alert"` panels with the offending field marked `aria-invalid` and focused.
- The theme toggle, the mobile menu and the tabs all expose their state (`aria-pressed`,
  `aria-expanded`, `role="tablist"`).
- `prefers-reduced-motion` removes every transform and transition.
- Without `backdrop-filter`, glass surfaces fall back to an opaque background rather than a smear.

## Type and colour

Cream paper, deep ink, one forest accent, one gold for emphasis. Display type is a serif for
headlines and a humanist sans for everything else; numerals are tabular in tables and stats so
columns line up.
