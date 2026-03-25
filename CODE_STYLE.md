# Code Style Guide — Yalies

## Project Architecture

**Monorepo** with 4 packages:

| Package | Purpose | Tech |
|---|---|---|
| `yalies-web` | Next.js frontend | React 18+, SCSS Modules |
| `yalies-backend` | Express API server | Express, Sequelize, Elasticsearch |
| `yalies-shared` | Shared types | TypeScript types/interfaces |
| `yalies-scraper` | Data scraping | Node.js |

Runtime: **Node 20.13.0** (`.nvmrc` in each package).

---

## TypeScript Conventions

### General
- **Strict mode** enabled in all packages
- Target: **ESNext**
- Double quotes (`"`) for strings
- Tabs for indentation
- Always-multiline trailing commas
- No `.then()` chains — use `async/await`

### Backend-specific
- ES module imports with `.js` extensions: `import Foo from "./foo.js"`
- Private class fields use native `#` prefix: `#elasticsearch`
- Arrow function class methods to preserve `this` context

### Frontend-specific
- Path aliases: `@/components/`, `@/hooks/`, `@/consts`
- `"use client"` directive on pages/components that use hooks or browser APIs
- Props typed inline at the function signature (no separate `Props` type export):
  ```typescript
  export default function Filters({
    filters,
    setFilterValue,
  }: {
    filters: Record<string, string[]>;
    setFilterValue: (key: string, newValue: string[]) => void;
  })
  ```

### Shared Types
- Flat type definitions in `datatypes.ts`
- Optional fields marked with `?`
- Types exported individually (no barrel files)

---

## Backend Patterns

### Router Class Pattern
Each route group is a **class** with:
1. Constructor receiving dependencies (DI)
2. `getRouter()` method returning an Express `Router`
3. Route handlers as **arrow function** class methods

```typescript
export default class PeopleRouter {
  #elasticsearch: Elasticsearch;

  constructor(elasticsearch: Elasticsearch) {
    this.#elasticsearch = elasticsearch;
  }

  getRouter = () => {
    const router = express.Router();
    router.post("/", CAS.requireAuthentication, this.getPeople);
    return router;
  };

  getPeople = async (req: Request, res: Response) => { ... };
}
```

### Model Pattern
- Sequelize `Model` subclasses with declared properties
- Static `initModel()` method for schema definition
- `toSanitizedObject()` instance method that strips null fields before sending to client

### Error Handling
- Try-catch with `console.error()` logging
- HTTP status codes: 400 (bad request), 401 (unauth), 403 (forbidden), 500 (server error)
- Error messages via `res.status(code).send(message)`

### Authentication
- CAS (Yale SSO) via Passport.js
- Dual auth: session-based (web) + bearer token (API keys)
- Middleware: `CAS.requireAuthentication`

---

## Frontend Patterns

### Component Structure
- **Functional components** only (no class components)
- One component per file, `export default function ComponentName`
- Paired files: `ComponentName.tsx` + `componentname.module.scss`
- Styles imported as `styles` object: `className={styles.container}`

### Component Hierarchy
- **Page components** (`page.tsx`): manage state, call APIs, compose child components
- **UI components** (`components/`): receive props, handle presentation
- **Compound components**: e.g. `Dropdown` contains `DropdownPopup`, `DropdownChip`, `DropdownOptions`

### State Management
- **Local state only** — `useState`, `useCallback`, `useEffect`, `useMemo`, `useRef`
- No global store (no Redux/Zustand)
- Server data fetched with `fetch()` in `useEffect` or callbacks
- Auth token managed via cookies (`cookies-next`)

### API Call Pattern
```typescript
const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v2/endpoint`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify(payload),
});

if (!response.ok) {
  if (response.status === 401) { setUnauthenticated(true); return; }
  if (response.status === 403) { window.location.href = "/forbidden"; return; }
}

const data = await response.json();
```

### Infinite Scroll
- Uses `react-infinite-scroll-component`
- Page-based pagination (zero-indexed)
- Results appended to existing array

---

## Styling

### Technology
- **SCSS** with **CSS Modules** (`.module.scss`)
- Shared variables/mixins in `_shared.scss`

### Design Tokens (`_shared.scss`)
- Color palette as SCSS variables: `$accent`, `$foreground`, `$secondary`, `$background`
- Component colors: `$chip-color`, `$destructive`, `$selection-foreground`
- Border radius: `$border-radius-standard: 4px`
- Mobile breakpoint: `$MOBILE_WIDTH: 700px`

### Responsive Design
```scss
@mixin responsive() {
  @media (max-width: $MOBILE_WIDTH) {
    @content;
  }
}
```

### Layout
- Flexbox-based layouts throughout
- `rails()` mixin for consistent horizontal padding
- `info_page()` mixin for content pages (about, FAQ, API docs)

---

## File Naming

| Type | Convention | Example |
|---|---|---|
| React components | PascalCase | `Filters.tsx`, `PeopleGrid.tsx` |
| SCSS modules | lowercase | `filters.module.scss` |
| Hooks | camelCase with `use` prefix | `useAuth.tsx` |
| Backend classes | PascalCase | `PeopleRouter.ts`, `PersonModel.ts` |
| Utility files | camelCase | `util.ts`, `cas.ts` |
| Shared types | camelCase | `datatypes.ts` |

---

## API Design

- All endpoints under `/v2/` prefix
- `POST` for search/data retrieval with body params
- `GET` for simple lookups and auth flows
- Request bodies use `Record<string, string[]>` for multi-select filters
- Responses: direct JSON on success, string message on error

---

## Search Strategy

1. Elasticsearch for fuzzy/full-text name search
2. SQL fallback for exact matches and filter queries
3. Two-phase: exact match first, then fuzzy
4. Special handling for 2-character queries (initials)
5. Trigram indexing for fuzzy SQL search

---

## Key Dependencies

**Frontend**: React 18, Next.js, FontAwesome, react-infinite-scroll-component, cookies-next
**Backend**: Express, Sequelize, Passport.js, @elastic/elasticsearch, dotenv
**Shared**: TypeScript 5+

---

## What This Project Does NOT Use

- No test framework (no tests present)
- No Redux/Zustand/global state
- No Tailwind CSS
- No barrel files / re-exports
- No separate Props type definitions (inline only)
- No class components
