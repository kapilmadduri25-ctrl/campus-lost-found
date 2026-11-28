# Design notes

LOSTLY is a campus lost-and-found board, so the interface borrows from the physical
world it replaces: noticeboards, luggage tags, paper forms and rubber stamps. Everything
below is a rule, not a preference.

## The one rule

**One depth treatment per element.**

| Role | Technique | Why |
|---|---|---|
| Containers — cards, nav, tables, toasts, match cards | **Glass** | translucency separates layers without adding weight; the page keeps its paper feel |
| Controls — buttons, inputs, chips, segmented controls | **Neumorphism** | a control should look pressable; the inset shadow tells you where to type |
| Character — item cards, tags, status stamps | **Skeuomorphism** | a found item is a physical object: grain, tape, perforation, a rubber stamp on a returned listing |

Applying all three to the same surface is what makes an interface look like a mock-up
rather than a product. Applied by role, they read as one material world.

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

The home page hero renders the three newest real listings and links to them. When the board
is empty it explains the three steps instead of showing fake cards. Nothing on the site
displays sample content that is not in the database.

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
